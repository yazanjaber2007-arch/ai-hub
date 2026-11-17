"""All hub logic. REST, MCP and the dashboard are thin layers over these functions."""
from __future__ import annotations

from datetime import timedelta

import httpx
from sqlalchemy import select

from . import config
from .db import Brief, BotSeen, Synthesis, Task, session, utcnow

KINDS = {"brief", "alert", "note"}
PRIORITIES = {"low", "normal", "high"}


class HubError(ValueError):
    """A problem the caller should see (bad input, unknown bot)."""


def _check_bot(bot: str) -> str:
    bot = config.slug(bot)
    if bot not in config.settings.bot_tokens:
        raise HubError(f"Unknown bot '{bot}'")
    return bot


def touch_bot(bot: str) -> None:
    with session() as s:
        row = s.get(BotSeen, bot)
        if row:
            row.last_seen = utcnow()
        else:
            s.add(BotSeen(bot=bot, last_seen=utcnow()))
        s.commit()


def _brief_dict(b: Brief) -> dict:
    return {"id": b.id, "bot": b.bot, "kind": b.kind, "priority": b.priority,
            "title": b.title, "body": b.body, "items": b.items or [],
            "created_at": b.created_at.isoformat() + "Z"}


def _task_dict(t: Task) -> dict:
    return {"id": t.id, "bot": t.bot, "title": t.title, "detail": t.detail,
            "status": t.status, "created_by": t.created_by, "result": t.result,
            "created_at": t.created_at.isoformat() + "Z",
            "completed_at": t.completed_at.isoformat() + "Z" if t.completed_at else None,
            "wake_status": t.wake_status}


def post_brief(bot: str, title: str, body: str, kind: str = "brief",
               priority: str = "normal", items: list | None = None) -> dict:
    bot = _check_bot(bot)
    title, body = (title or "").strip(), (body or "").strip()
    if not title or not body:
        raise HubError("title and body are required")
    if len(title) > 200:
        raise HubError("title is limited to 200 characters")
    if len(body) > 20000:
        raise HubError("body is limited to 20000 characters")
    if kind not in KINDS:
        raise HubError(f"kind must be one of {sorted(KINDS)}")
    if priority not in PRIORITIES:
        raise HubError(f"priority must be one of {sorted(PRIORITIES)}")
    clean = [str(i)[:500] for i in (items or [])][:50]
    with session() as s:
        b = Brief(bot=bot, kind=kind, priority=priority, title=title, body=body, items=clean)
        s.add(b)
        s.commit()
        out = _brief_dict(b)
    touch_bot(bot)
    return out


def list_briefs(hours: int = 24, bot: str | None = None, limit: int = 100) -> list[dict]:
    since = utcnow() - timedelta(hours=max(1, min(hours, 24 * 30)))
    q = select(Brief).where(Brief.created_at >= since).order_by(Brief.created_at.desc()).limit(min(limit, 500))
    if bot:
        q = q.where(Brief.bot == _check_bot(bot))
    with session() as s:
        return [_brief_dict(b) for b in s.scalars(q)]


def open_tasks(bot: str) -> list[dict]:
    bot = _check_bot(bot)
    with session() as s:
        rows = s.scalars(select(Task).where(Task.bot == bot, Task.status == "open").order_by(Task.created_at))
        out = [_task_dict(t) for t in rows]
    touch_bot(bot)
    return out


def _wake(bot: str, task: dict) -> str:
    cfg = config.settings.bot_webhooks.get(bot)
    if not cfg or not cfg.get("url"):
        return "no webhook configured"
    headers = {"Content-Type": "application/json"}
    if cfg.get("key"):
        headers["Authorization"] = f"Bearer {cfg['key']}"
    # The bot's routine should call get_my_tasks; the payload is only a nudge.
    payload = {"event": "new_task", "task_id": task["id"], "title": task["title"],
               "instruction": "A new task is waiting in the hub. Call get_my_tasks and do it."}
    try:
        r = httpx.post(cfg["url"], json=payload, headers=headers, timeout=8)
        return f"woke ({r.status_code})" if r.is_success else f"wake failed ({r.status_code})"
    except httpx.HTTPError as e:
        return f"wake failed ({type(e).__name__})"


def create_task(bot: str, title: str, detail: str = "", created_by: str = "claude") -> dict:
    bot = _check_bot(bot)
    title = (title or "").strip()
    if not title or len(title) > 200:
        raise HubError("title is required (max 200 characters)")
    if len(detail or "") > 10000:
        raise HubError("detail is limited to 10000 characters")
    with session() as s:
        t = Task(bot=bot, title=title, detail=detail or "", created_by=created_by)
        s.add(t)
        s.commit()
        d = _task_dict(t)
    status = _wake(bot, d)
    with session() as s:
        t = s.get(Task, d["id"])
        t.wake_status = status
        s.commit()
        return _task_dict(t)


def complete_task(bot: str, task_id: int, result: str = "") -> dict:
    bot = _check_bot(bot)
    with session() as s:
        t = s.get(Task, task_id)
        if not t or t.bot != bot:  # a bot can only close its own tasks
            raise HubError("Task not found")
        t.status = "done"
        t.result = (result or "")[:10000]
        t.completed_at = utcnow()
        s.commit()
        out = _task_dict(t)
    touch_bot(bot)
    return out


def save_synthesis(content: dict) -> dict:
    with session() as s:
        row = Synthesis(content=content)
        s.add(row)
        s.commit()
        return {"id": row.id, "content": row.content, "created_at": row.created_at.isoformat() + "Z"}


def latest_synthesis() -> dict | None:
    with session() as s:
        row = s.scalars(select(Synthesis).order_by(Synthesis.created_at.desc()).limit(1)).first()
        if not row:
            return None
        return {"id": row.id, "content": row.content, "created_at": row.created_at.isoformat() + "Z"}


def overview() -> dict:
    now = utcnow()
    stale = timedelta(hours=config.settings.stale_hours)
    bots = []
    with session() as s:
        seen = {r.bot: r.last_seen for r in s.scalars(select(BotSeen))}
        for bot in sorted(config.settings.bot_tokens):
            last_brief = s.scalars(select(Brief.created_at).where(Brief.bot == bot)
                                   .order_by(Brief.created_at.desc()).limit(1)).first()
            n_open = len(s.scalars(select(Task.id).where(Task.bot == bot, Task.status == "open")).all())
            ok = last_brief is not None and now - last_brief < stale
            bots.append({"bot": bot, "healthy": ok,
                         "last_brief": last_brief.isoformat() + "Z" if last_brief else None,
                         "last_seen": seen[bot].isoformat() + "Z" if bot in seen else None,
                         "open_tasks": n_open})
        tasks = [_task_dict(t) for t in s.scalars(select(Task).order_by(Task.created_at.desc()).limit(30))]
    return {"bots": bots, "briefs": list_briefs(24), "tasks": tasks,
            "synthesis": latest_synthesis(), "now": now.isoformat() + "Z"}

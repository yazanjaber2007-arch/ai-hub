"""All hub logic. REST, MCP and the dashboard are thin layers over these functions."""
from __future__ import annotations

import json
import re
from datetime import datetime, time, timedelta

import httpx
from pydantic import ValidationError
from sqlalchemy import delete, select

from . import config
from .db import Approval, Audit, Brief, BotSeen, SnapshotHist, SnapshotRow, Synthesis, Task, session, utcnow
from .schemas import SnapshotIn

KINDS = {"brief", "alert", "note"}
PRIORITIES = {"low", "normal", "high"}


class HubError(ValueError):
    """A problem the caller should see (bad input, unknown bot)."""


def _check_bot(bot: str) -> str:
    bot = config.slug(bot)
    if bot not in config.settings.bot_tokens:
        raise HubError(f"Unknown bot '{bot}'")
    return bot


def audit(actor: str, action: str, target: str = "", detail: str = "") -> None:
    with session() as s:
        s.add(Audit(actor=str(actor)[:64], action=action[:32], target=str(target)[:64], detail=str(detail)[:300]))
        s.commit()


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
    audit(bot, "brief", str(out["id"]), title)
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
    audit(created_by, "task_created", bot, title)
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
    audit(bot, "task_done", str(task_id), (result or "")[:200])
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


# ---------------------------------------------------------------- snapshots

def post_snapshot(bot: str, data: dict) -> dict:
    """Store a bot's latest structured state (replaces the previous one)."""
    bot = _check_bot(bot)
    try:
        if len(json.dumps(data)) > 60_000:
            raise HubError("snapshot is limited to 60 KB")
    except TypeError:
        raise HubError("snapshot must be plain JSON") from None
    try:
        snap = SnapshotIn.model_validate(data)
    except ValidationError as e:
        msgs = [f"{'.'.join(str(x) for x in err['loc']) or 'snapshot'}: {err['msg']}" for err in e.errors()[:5]]
        raise HubError("Invalid snapshot: " + "; ".join(msgs)) from None
    clean = snap.model_dump(exclude_none=True)
    with session() as s:
        row = s.get(SnapshotRow, bot)
        if row:
            row.data, row.updated_at = clean, utcnow()
        else:
            s.add(SnapshotRow(bot=bot, data=clean, updated_at=utcnow()))
        # history for trends: only when something changed, 90 days, at most 400 rows per bot
        last = s.scalars(select(SnapshotHist).where(SnapshotHist.bot == bot).order_by(SnapshotHist.at.desc()).limit(1)).first()
        if not last or last.data != clean:
            s.add(SnapshotHist(bot=bot, data=clean, at=utcnow()))
        s.execute(delete(SnapshotHist).where(SnapshotHist.bot == bot, SnapshotHist.at < utcnow() - timedelta(days=90)))
        keep = s.scalars(select(SnapshotHist.id).where(SnapshotHist.bot == bot).order_by(SnapshotHist.at.desc()).offset(400)).all()
        if keep:
            s.execute(delete(SnapshotHist).where(SnapshotHist.id.in_(keep)))
        s.commit()
    touch_bot(bot)
    audit(bot, "snapshot", bot, ",".join(sorted(clean)))
    return {"ok": True, "fields": sorted(clean)}


def snapshots() -> dict:
    with session() as s:
        return {r.bot: {**r.data, "updated_at": r.updated_at.isoformat() + "Z"} for r in s.scalars(select(SnapshotRow))}


# ---------------------------------------------------------------- approvals

def _approval_dict(a: Approval) -> dict:
    return {"id": a.id, "bot": a.bot, "title": a.title, "detail": a.detail, "amount": a.amount,
            "status": a.status, "created_at": a.created_at.isoformat() + "Z",
            "decided_at": a.decided_at.isoformat() + "Z" if a.decided_at else None}


def request_approval(bot: str, title: str, detail: str = "", amount: str = "") -> dict:
    bot = _check_bot(bot)
    title = (title or "").strip()
    if not title or len(title) > 200:
        raise HubError("title is required (max 200 characters)")
    if len(detail or "") > 2000 or len(amount or "") > 40:
        raise HubError("detail is limited to 2000 characters and amount to 40")
    with session() as s:
        pending = len(s.scalars(select(Approval.id).where(Approval.bot == bot, Approval.status == "pending")).all())
        if pending >= 20:
            raise HubError("Too many pending approvals for this bot (20). Wait for the owner to decide.")
        a = Approval(bot=bot, title=title, detail=detail or "", amount=amount or "")
        s.add(a)
        s.commit()
        out = _approval_dict(a)
    touch_bot(bot)
    audit(bot, "approval_requested", str(out["id"]), title)
    return out


def get_approval(bot: str, approval_id: int) -> dict:
    bot = _check_bot(bot)
    with session() as s:
        a = s.get(Approval, approval_id)
        if not a or a.bot != bot:  # a bot can only see its own requests
            raise HubError("Approval not found")
        return _approval_dict(a)


def list_approvals(status: str | None = "pending", limit: int = 50) -> list[dict]:
    q = select(Approval).order_by(Approval.created_at.desc()).limit(min(limit, 200))
    if status:
        q = q.where(Approval.status == status)
    with session() as s:
        return [_approval_dict(a) for a in s.scalars(q)]


def decide_approval(approval_id: int, decision: str, actor: str = "owner") -> dict:
    """Owner's yes/no. Gives the bot a task saying what was decided, and wakes it."""
    if decision not in ("approve", "decline"):
        raise HubError("decision must be 'approve' or 'decline'")
    with session() as s:
        a = s.get(Approval, approval_id)
        if not a:
            raise HubError("Approval not found")
        if a.status != "pending":
            raise HubError(f"Already {a.status}")
        a.status = "approved" if decision == "approve" else "declined"
        a.decided_at = utcnow()
        s.commit()
        out = _approval_dict(a)
    audit(actor, "approval_" + out["status"], str(approval_id), out["title"])
    verdict = "APPROVED" if decision == "approve" else "DECLINED"
    note = ("Go ahead and carry it out, then complete this task with a short result."
            if decision == "approve" else "Do not carry it out. Complete this task to acknowledge.")
    task = create_task(out["bot"], f"{verdict}: {out['title']}",
                       f"The owner {out['status']} approval request #{approval_id}. {note}", created_by=actor)
    return {"approval": out, "task": task}


# ---------------------------------------------------------------- audit + grid

def list_audit(limit: int = 100) -> list[dict]:
    with session() as s:
        rows = s.scalars(select(Audit).order_by(Audit.at.desc()).limit(min(limit, 500)))
        return [{"id": r.id, "at": r.at.isoformat() + "Z", "actor": r.actor, "action": r.action,
                 "target": r.target, "detail": r.detail} for r in rows]


def reporting_grid(days: int = 14) -> dict:
    """Reports per bot per day (UTC), counted from the audit trail. Needs nothing from the bots."""
    days = max(1, min(days, 60))
    first = utcnow().date() - timedelta(days=days - 1)
    since = datetime.combine(first, time.min)
    rows = {bot: [0] * days for bot in config.settings.bot_tokens}
    with session() as s:
        for actor, at in s.execute(select(Audit.actor, Audit.at).where(
                Audit.action.in_(("brief", "snapshot")), Audit.at >= since)):
            idx = (at.date() - first).days
            if actor in rows and 0 <= idx < days:
                rows[actor][idx] += 1
    return {"dates": [(first + timedelta(days=i)).isoformat() for i in range(days)], "rows": rows}


def _last_report(s, bot: str):
    b = s.scalars(select(Brief.created_at).where(Brief.bot == bot).order_by(Brief.created_at.desc()).limit(1)).first()
    snap = s.get(SnapshotRow, bot)
    times = [t for t in (b, snap.updated_at if snap else None) if t]
    return max(times) if times else None


_NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?")
TREND_VITALS = ("steps", "sleep_hours", "heart_rate", "recovery", "streak", "calories", "protein_g", "carbs_g", "fat_g", "water_ml", "weight_kg")


def _number(text) -> float | None:
    if isinstance(text, (int, float)) and not isinstance(text, bool):
        return float(text)
    m = _NUM.search(str(text))
    return float(m.group(0).replace(",", "")) if m else None


def _trends(hist: list) -> dict:
    """label -> [[date, value], ...] (the last value of each day) for every numeric vital and tile with at least two days."""
    per: dict[str, dict[str, float]] = {}
    for h in hist:
        day = h.at.date().isoformat()
        d = h.data or {}
        for k in TREND_VITALS:
            v = (d.get("vitals") or {}).get(k)
            if v is not None:
                per.setdefault(k, {})[day] = float(v)
        for t in d.get("tiles") or []:
            n = _number(t.get("value"))
            if n is not None:
                per.setdefault(t.get("label", ""), {})[day] = n
    return {k: sorted([d, v] for d, v in days.items()) for k, days in per.items() if k and len(days) >= 2}


def bot_detail(bot: str) -> dict:
    """Everything one bot has sent: its latest state, history of briefs, tasks and approvals, 30 days of reporting and trends."""
    bot = _check_bot(bot)
    now = utcnow()
    persona = config.settings.personas()[bot]
    with session() as s:
        snap = s.get(SnapshotRow, bot)
        briefs = [_brief_dict(b) for b in s.scalars(select(Brief).where(Brief.bot == bot).order_by(Brief.created_at.desc()).limit(60))]
        tasks = [_task_dict(t) for t in s.scalars(select(Task).where(Task.bot == bot).order_by(Task.created_at.desc()).limit(40))]
        approvals = [_approval_dict(a) for a in s.scalars(select(Approval).where(Approval.bot == bot).order_by(Approval.created_at.desc()).limit(30))]
        hist = list(s.scalars(select(SnapshotHist).where(SnapshotHist.bot == bot, SnapshotHist.at >= now - timedelta(days=30)).order_by(SnapshotHist.at)))
        seen = s.get(BotSeen, bot)
        last = _last_report(s, bot)
    healthy = last is not None and now - last < timedelta(hours=config.settings.stale_hours)
    active = seen is not None and now - seen.last_seen < timedelta(minutes=3)
    grid = reporting_grid(30)
    return {
        "bot": bot, "name": persona["name"], "role": persona["role"], "sensitive": bot in config.settings.sensitive_bots,
        "state": "silent" if not healthy else ("working" if active else "idle"),
        "last_report": last.isoformat() + "Z" if last else None, "last_seen": seen.last_seen.isoformat() + "Z" if seen else None,
        "open_tasks": sum(1 for t in tasks if t["status"] == "open"),
        "snapshot": {**snap.data, "updated_at": snap.updated_at.isoformat() + "Z"} if snap else None,
        "briefs": briefs, "tasks": tasks, "approvals": approvals, "trends": _trends(hist),
        "grid": {"dates": grid["dates"], "counts": grid["rows"][bot]},
    }


def dashboard() -> dict:
    """Everything the Command Center needs in one call."""
    now = utcnow()
    stale = timedelta(hours=config.settings.stale_hours)
    bots = []
    personas = config.settings.personas()
    with session() as s:
        seen = {r.bot: r.last_seen for r in s.scalars(select(BotSeen))}
        for bot in sorted(config.settings.bot_tokens):
            last = _last_report(s, bot)
            n_open = len(s.scalars(select(Task.id).where(Task.bot == bot, Task.status == "open")).all())
            healthy = last is not None and now - last < stale
            active = bot in seen and now - seen[bot] < timedelta(minutes=3)
            bots.append({"bot": bot, "name": personas[bot]["name"], "role": personas[bot]["role"],
                         "sensitive": bot in config.settings.sensitive_bots, "healthy": healthy, "state": "silent" if not healthy else ("working" if active else "idle"),
                         "last_report": last.isoformat() + "Z" if last else None,
                         "last_seen": seen[bot].isoformat() + "Z" if bot in seen else None, "open_tasks": n_open})
        tasks = [_task_dict(t) for t in s.scalars(select(Task).order_by(Task.created_at.desc()).limit(30))]
    return {"owner": config.settings.owner_name, "now": now.isoformat() + "Z", "bots": bots,
            "snapshots": snapshots(), "briefs": list_briefs(24), "tasks": tasks,
            "approvals": list_approvals("pending"), "grid": reporting_grid(14)}


def overview() -> dict:
    now = utcnow()
    stale = timedelta(hours=config.settings.stale_hours)
    bots = []
    personas = config.settings.personas()
    with session() as s:
        seen = {r.bot: r.last_seen for r in s.scalars(select(BotSeen))}
        for bot in sorted(config.settings.bot_tokens):
            last_brief = _last_report(s, bot)
            n_open = len(s.scalars(select(Task.id).where(Task.bot == bot, Task.status == "open")).all())
            ok = last_brief is not None and now - last_brief < stale
            bots.append({"bot": bot, "healthy": ok,
                         "last_brief": last_brief.isoformat() + "Z" if last_brief else None,
                         "last_seen": seen[bot].isoformat() + "Z" if bot in seen else None,
                         "open_tasks": n_open})
        tasks = [_task_dict(t) for t in s.scalars(select(Task).order_by(Task.created_at.desc()).limit(30))]
    return {"bots": bots, "briefs": list_briefs(24), "tasks": tasks,
            "synthesis": latest_synthesis(), "now": now.isoformat() + "Z"}

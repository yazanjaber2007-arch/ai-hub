from __future__ import annotations

import contextlib
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from itsdangerous import BadSignature, TimestampSigner
from pydantic import BaseModel, Field

from . import auth, config, core, db
from .mcp_server import BearerMiddleware, build_mcp

COOKIE = "hub_session"
SESSION_AGE = 60 * 60 * 24 * 30
_login_attempts: dict[str, list[float]] = defaultdict(list)


def principal(request: Request) -> auth.Principal:
    p = auth.from_bearer(request.headers.get("authorization"))
    if p:
        return p
    cookie = request.cookies.get(COOKIE)
    if cookie:
        try:
            TimestampSigner(config.settings.session_secret).unsign(cookie, max_age=SESSION_AGE)
            return auth.Principal("admin")
        except BadSignature:
            pass
    raise HTTPException(401, "Unauthorized")


def admin(p: auth.Principal = Depends(principal)) -> auth.Principal:
    if p.role != "admin":
        raise HTTPException(403, "Admin only")
    return p


def bot_only(p: auth.Principal = Depends(principal)) -> auth.Principal:
    if p.role != "bot":
        raise HTTPException(403, "Bot token required")
    return p


class BriefIn(BaseModel):
    title: str
    body: str
    kind: str = "brief"
    priority: str = "normal"
    items: list[str] = Field(default_factory=list)


class TaskIn(BaseModel):
    bot: str
    title: str
    detail: str = ""


class DoneIn(BaseModel):
    result: str = ""


class LoginIn(BaseModel):
    password: str


def create_app(settings: config.Settings | None = None) -> FastAPI:
    config.settings = settings or config.load_settings()
    db.init_db(config.settings.database_url)

    mcp = build_mcp()

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        async with mcp.session_manager.run():
            yield

    app = FastAPI(title="Hub", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(core.HubError)
    async def hub_error(_, exc: core.HubError):
        return JSONResponse({"error": str(exc)}, status_code=400)

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/login")
    def login(body: LoginIn, request: Request, response: Response):
        ip = request.client.host if request.client else "?"
        now = time.time()
        _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < 60]
        if len(_login_attempts[ip]) >= 5:
            raise HTTPException(429, "Too many attempts, wait a minute")
        _login_attempts[ip].append(now)
        pw = config.settings.dashboard_password
        import hmac
        if not pw or not hmac.compare_digest(body.password.encode(), pw.encode()):
            raise HTTPException(401, "Wrong password")
        token = TimestampSigner(config.settings.session_secret).sign(b"admin").decode()
        response.set_cookie(COOKIE, token, max_age=SESSION_AGE, httponly=True,
                            secure=config.settings.cookie_secure, samesite="lax")
        return {"ok": True}

    @app.post("/logout")
    def logout(response: Response):
        response.delete_cookie(COOKIE)
        return {"ok": True}

    # --- bot-facing (also available over MCP) ---
    @app.post("/ingest/brief")
    def ingest(b: BriefIn, p: auth.Principal = Depends(bot_only)):
        return core.post_brief(p.bot, b.title, b.body, b.kind, b.priority, b.items)

    @app.get("/ingest/tasks")
    def my_tasks(p: auth.Principal = Depends(bot_only)):
        return core.open_tasks(p.bot)

    @app.post("/ingest/tasks/{task_id}/done")
    def done(task_id: int, d: DoneIn, p: auth.Principal = Depends(bot_only)):
        return core.complete_task(p.bot, task_id, d.result)

    # --- admin / dashboard ---
    @app.get("/api/overview")
    def overview(_: auth.Principal = Depends(admin)):
        return core.overview()

    @app.get("/api/briefs")
    def briefs(hours: int = 24, bot: str | None = None, _: auth.Principal = Depends(admin)):
        return core.list_briefs(hours, bot)

    @app.post("/api/tasks")
    def new_task(t: TaskIn, request: Request, _: auth.Principal = Depends(admin)):
        # Admin bearer token = Claude or a script; the dashboard cookie = the owner typing it in.
        by = "claude" if request.headers.get("authorization") else "owner"
        return core.create_task(t.bot, t.title, t.detail, created_by=by)

    @app.post("/api/synthesis/run")
    def run_synth(_: auth.Principal = Depends(admin)):
        from . import synth
        return synth.run(hours=24)

    static = Path(__file__).parent / "static"

    @app.get("/")
    def index():
        return FileResponse(static / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/command")
    def command():
        return FileResponse(static / "command.html", headers={"Cache-Control": "no-store"})

    # MCP last, so it doesn't shadow the routes above. Endpoint: /mcp
    app.mount("/", BearerMiddleware(mcp.streamable_http_app()))
    return app


def app_factory() -> FastAPI:  # uvicorn --factory app.main:app_factory
    return create_app()

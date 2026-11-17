from __future__ import annotations

import contextlib
import re
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Body, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from itsdangerous import BadSignature, TimestampSigner
from pydantic import BaseModel, Field

from . import auth, config, core, db, pages
from .mcp_server import BearerMiddleware, build_mcp

# Defense in depth for the dashboard pages (they can approve payments): nothing may frame them, and nothing may
# load from or talk to another origin. Inline script/style stay allowed because the page is assembled inline.
PAGE_SECURITY_HEADERS = {
    "Content-Security-Policy": ("default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                                "img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; "
                                "frame-ancestors 'none'; object-src 'none'"),
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}

COOKIE = "hub_session"
_login_attempts: dict[str, list[float]] = defaultdict(list)


def _session_ok(request: Request) -> bool:
    cookie = request.cookies.get(COOKIE)
    if not cookie:
        return False
    try:
        TimestampSigner(config.settings.session_secret).unsign(cookie, max_age=config.settings.session_hours * 3600)
        return True
    except BadSignature:
        return False


def principal(request: Request) -> auth.Principal:
    p = auth.from_bearer(request.headers.get("authorization"))
    if p:
        return p
    if _session_ok(request):
        return auth.Principal("admin")
    raise HTTPException(401, "Unauthorized")


def owner_session(request: Request) -> auth.Principal:
    """Only a person logged in to the dashboard. Bearer tokens (even admin) are not enough."""
    if not _session_ok(request):
        raise HTTPException(403, "Approvals can only be decided from the dashboard")
    return auth.Principal("admin")


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


class ApprovalIn(BaseModel):
    title: str
    detail: str = ""
    amount: str = ""


class DecideIn(BaseModel):
    decision: str


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
            core.audit("dashboard", "login_failed")
            raise HTTPException(401, "Wrong password")
        core.audit("dashboard", "login")
        token = TimestampSigner(config.settings.session_secret).sign(b"admin").decode()
        response.set_cookie(COOKIE, token, max_age=config.settings.session_hours * 3600, httponly=True,
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

    @app.post("/ingest/snapshot")
    def ingest_snapshot(snap: dict = Body(...), p: auth.Principal = Depends(bot_only)):
        return core.post_snapshot(p.bot, snap)

    @app.post("/ingest/approvals")
    def ingest_approval(a: ApprovalIn, p: auth.Principal = Depends(bot_only)):
        return core.request_approval(p.bot, a.title, a.detail, a.amount)

    @app.get("/ingest/approvals/{approval_id}")
    def ingest_approval_status(approval_id: int, p: auth.Principal = Depends(bot_only)):
        return core.get_approval(p.bot, approval_id)

    # --- admin / dashboard ---
    @app.get("/api/dashboard")
    def dash(_: auth.Principal = Depends(admin)):
        return core.dashboard()

    @app.get("/api/approvals")
    def approvals(status: str = "pending", _: auth.Principal = Depends(admin)):
        return core.list_approvals(status or None)

    @app.post("/api/approvals/{approval_id}/decide")
    def decide(approval_id: int, d: DecideIn, _: auth.Principal = Depends(owner_session)):
        return core.decide_approval(approval_id, d.decision, actor="owner")

    @app.get("/api/audit")
    def audit_log(limit: int = 100, _: auth.Principal = Depends(admin)):
        return core.list_audit(limit)

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

    def _page(request: Request, mode: str) -> Response:
        """One source tree, three builds (see app/pages.py). The demo and preview builds physically
        exclude the live-data code (login, API calls, approvals); the live build excludes demo controls."""
        head = '<meta name="robots" content="noindex,nofollow">'
        if mode == "demo":
            host = request.headers.get("host", "")
            safe = host if re.fullmatch(r"[A-Za-z0-9.\-]+(:\d+)?", host or "") else ""
            img = f"https://{safe}/demo/og.jpg" if safe else ""
            head += ('<meta property="og:title" content="Command Center: an AI dashboard demo">'
                     '<meta property="og:description" content="A Jarvis-style control panel for a team of AI assistants. Sample data only. Try the alert, the approvals and the command palette.">'
                     '<meta property="og:type" content="website">'
                     + (f'<meta property="og:image" content="{img}"><meta name="twitter:card" content="summary_large_image">' if img else ""))
        headers = {"Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Vary": "Accept-Encoding", **PAGE_SECURITY_HEADERS}
        if "gzip" in request.headers.get("accept-encoding", "").lower():
            return Response(pages.render_compressed(mode, head), media_type="text/html; charset=utf-8",
                            headers={**headers, "Content-Encoding": "gzip"})
        return HTMLResponse(pages.render(mode, head), headers=headers)

    @app.get("/assets/{rel:path}")
    def asset(rel: str, request: Request, v: str | None = None):
        """Fonts and the 3D bundle. Whitelisted extensions inside static/assets only."""
        hit = pages.asset(rel, request.headers.get("accept-encoding", ""))
        if not hit:
            raise HTTPException(404, "Not found")
        path, encoding, ctype = hit
        headers = {"Cache-Control": "public, max-age=31536000, immutable" if v else "public, max-age=3600",
                   "Vary": "Accept-Encoding", "X-Content-Type-Options": "nosniff"}
        if encoding:
            headers["Content-Encoding"] = encoding
        return FileResponse(path, media_type=ctype, headers=headers)

    @app.get("/command")
    def command(request: Request):
        # The page itself holds no data; everything comes from /api/dashboard after login.
        return _page(request, "live")

    @app.get("/preview")
    def preview(request: Request):
        return _page(request, "preview")

    @app.get("/demo")
    def demo(request: Request):
        # Public, shareable, sample data only. ?name=Alex personalises the greeting (handled in the browser).
        return _page(request, "demo")

    @app.get("/demo/og.jpg")
    def demo_og():
        # 1200x630 share image of the dashboard (JPEG: 200 KB, where the PNG was 600 KB and chat apps skip big previews)
        return FileResponse(static / "og.jpg", media_type="image/jpeg", headers={"Cache-Control": "public, max-age=3600"})

    @app.get("/demo/og.png")
    def demo_og_legacy():
        return RedirectResponse("/demo/og.jpg", status_code=301)       # links shared before the switch keep working

    # MCP last, so it doesn't shadow the routes above. Endpoint: /mcp
    app.mount("/", BearerMiddleware(mcp.streamable_http_app()))
    return app


def app_factory() -> FastAPI:  # uvicorn --factory app.main:app_factory
    return create_app()

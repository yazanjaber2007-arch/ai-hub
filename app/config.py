"""Settings, read from environment variables. See README for the full list."""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

# Bots that must never appear in the shared hub, whatever the config says.
BLOCKED_BOT_WORDS = ("dating",)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")


@dataclass
class Settings:
    admin_token: str = ""                 # Claude / scripts: full access
    bot_tokens: dict[str, str] = field(default_factory=dict)  # bot slug -> token
    dashboard_password: str = ""
    session_secret: str = ""
    bot_webhooks: dict[str, dict] = field(default_factory=dict)  # bot -> {url, key}
    database_url: str = "sqlite:///hub.db"
    anthropic_api_key: str = ""
    synth_model: str = "claude-sonnet-5-5"
    stale_hours: int = 26
    cookie_secure: bool = True
    owner_name: str = "Mr. Stark"
    sensitive_bots: tuple = ("finance",)
    session_hours: int = 24

    def validate(self) -> None:
        for name in {**self.bot_tokens, **self.bot_webhooks}:
            if any(w in name for w in BLOCKED_BOT_WORDS):
                raise ValueError(
                    f"Bot '{name}' is blocked from the shared hub "
                    f"(blocked words: {', '.join(BLOCKED_BOT_WORDS)})"
                )
        if not self.admin_token or len(self.admin_token) < 24:
            raise ValueError("ADMIN_TOKEN must be set (24+ characters)")
        if not self.session_secret or len(self.session_secret) < 24:
            raise ValueError("SESSION_SECRET must be set (24+ characters)")
        for bot, tok in self.bot_tokens.items():
            if len(tok) < 24:
                raise ValueError(f"Token for bot '{bot}' must be 24+ characters")
        for bot in self.bot_webhooks:
            if bot not in self.bot_tokens:
                raise ValueError(f"Webhook configured for unknown bot '{bot}'")


def _json_env(name: str) -> dict:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return {}
    try:
        val = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"{name} is not valid JSON: {e}") from None
    if not isinstance(val, dict):
        raise ValueError(f"{name} must be a JSON object")
    return {slug(k): v for k, v in val.items()}


def load_settings() -> Settings:
    db = os.environ.get("DATABASE_URL", "sqlite:///hub.db")
    # Railway hands out postgres:// or postgresql://; SQLAlchemy needs the driver.
    db = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", db)
    s = Settings(
        admin_token=os.environ.get("ADMIN_TOKEN", ""),
        bot_tokens=_json_env("BOT_TOKENS"),
        dashboard_password=os.environ.get("DASHBOARD_PASSWORD", ""),
        session_secret=os.environ.get("SESSION_SECRET", ""),
        bot_webhooks=_json_env("BOT_WEBHOOKS"),
        database_url=db,
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        synth_model=os.environ.get("SYNTH_MODEL", "claude-sonnet-5-5"),
        stale_hours=int(os.environ.get("STALE_HOURS", "26")),
        cookie_secure=os.environ.get("COOKIE_SECURE", "1") != "0",
        owner_name=os.environ.get("OWNER_NAME", "Mr. Stark").strip()[:60] or "Mr. Stark",
        sensitive_bots=tuple(slug(x) for x in os.environ.get("SENSITIVE_BOTS", "finance").split(",") if slug(x)),
        session_hours=max(1, min(int(os.environ.get("SESSION_HOURS", "24")), 24 * 30)),
    )
    s.validate()
    return s


settings: Settings = Settings()  # replaced at startup (main.py) or in tests

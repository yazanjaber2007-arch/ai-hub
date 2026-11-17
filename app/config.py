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


# Display names for the dashboard (ids, tokens and webhooks keep using the slug). Each persona is a Greek god whose
# domain matches the bot's job, plus a plain-words role so you always know what a bot does. First match wins.
PERSONAS = (
    (r"chief|staff|exec|assistant", "Zeus", "Chief of staff"),
    (r"mail|inbox", "Hermes", "Inbox"),
    (r"social|growth|content|media|post", "Apollo", "Social growth"),
    (r"fit|health|gym|vital|body", "Heracles", "Fitness"),
    (r"fin|money|bank|cash|budget", "Plutus", "Finance"),
    (r"personal|home|life", "Hestia", "Personal"),
    (r"shop|store|commerce|order", "Hephaestus", "Store"),
)
# Used when two bots map to the same god, or a bot fits no persona. Those keep their own words as the role.
SPARE_NAMES = ("Athena", "Artemis", "Poseidon", "Demeter", "Ares", "Dionysus", "Hera", "Hades", "Iris", "Hecate")


def assign_personas(slugs, overrides: dict | None = None) -> dict:
    """slug -> {"name", "role"}. Stable for the same set of bots. `overrides` (BOT_NAMES) wins:
    {"social": "Apollo"} or {"social": {"name": "Apollo", "role": "Social growth"}}."""
    overrides, out, used = overrides or {}, {}, set()
    for o in overrides.values():
        n = o.get("name") if isinstance(o, dict) else o
        if isinstance(n, str):
            used.add(n.strip()[:30])
    spare = (n for n in SPARE_NAMES if n not in used)
    for bot in sorted(slugs):
        name = role = None
        for pat, n, r in PERSONAS:
            if re.search(pat, bot) and n not in used:
                name, role = n, r
                break
        o = overrides.get(bot)
        if isinstance(o, str):
            o = {"name": o}
        if isinstance(o, dict):
            name = (str(o["name"]).strip()[:30] if o.get("name") else None) or name
            role = (str(o["role"]).strip()[:40] if o.get("role") else None) or role
        if name is None:
            name = next(spare, bot)
        used.add(name)
        out[bot] = {"name": name, "role": role or bot.replace("-", " ")}
    return out


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
    bot_names: dict[str, object] = field(default_factory=dict)  # optional display-name overrides (BOT_NAMES)

    def personas(self) -> dict:
        return assign_personas(self.bot_tokens, self.bot_names)

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
        bot_names=_json_env("BOT_NAMES"),
    )
    s.validate()
    return s


settings: Settings = Settings()  # replaced at startup (main.py) or in tests

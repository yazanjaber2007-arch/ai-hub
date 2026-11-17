from __future__ import annotations

import hmac
from dataclasses import dataclass

from . import config


@dataclass(frozen=True)
class Principal:
    role: str            # "admin" or "bot"
    bot: str | None = None


def _eq(a: str, b: str) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(a.encode(), b.encode())


def from_bearer(header: str | None) -> Principal | None:
    if not header or not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    s = config.settings
    if _eq(token, s.admin_token):
        return Principal("admin")
    for bot, tok in s.bot_tokens.items():
        if _eq(token, tok):
            return Principal("bot", bot)
    return None

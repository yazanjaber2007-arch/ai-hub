"""What a bot may report as structured data. Strict on purpose: a typo gets a clear error,
so a bot never silently posts data the dashboard will ignore. Every field is optional."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Tile(_Strict):
    label: str = Field(max_length=40)
    value: str = Field(max_length=40)
    trend: Literal["up", "down", "flat"] | None = None


class Event(_Strict):
    at: str = Field(max_length=40)           # "14:00" or an ISO time
    title: str = Field(max_length=200)
    note: str = Field(default="", max_length=200)
    done: bool = False


class Vitals(_Strict):
    steps: int | None = Field(default=None, ge=0, le=200000)
    steps_goal: int | None = Field(default=None, ge=0, le=200000)
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    heart_rate: int | None = Field(default=None, ge=20, le=250)
    recovery: int | None = Field(default=None, ge=0, le=100)
    streak: int | None = Field(default=None, ge=0, le=100000)


class Category(_Strict):
    name: str = Field(max_length=40)
    pct: float = Field(ge=0, le=100)


class Bill(_Strict):
    name: str = Field(max_length=80)
    amount: str = Field(max_length=40)        # already formatted by the bot, e.g. "$84.20"
    due: str = Field(max_length=40)           # ISO date or text


class Finance(_Strict):
    balance: str | None = Field(default=None, max_length=40)
    change_30d: str | None = Field(default=None, max_length=40)
    series: list[float] = Field(default_factory=list, max_length=90)
    categories: list[Category] = Field(default_factory=list, max_length=8)
    bills: list[Bill] = Field(default_factory=list, max_length=10)


class SnapshotIn(_Strict):
    note: str = Field(default="", max_length=300)
    tiles: list[Tile] = Field(default_factory=list, max_length=8)
    events: list[Event] = Field(default_factory=list, max_length=30)
    priorities: list[str] = Field(default_factory=list, max_length=5)
    vitals: Vitals | None = None
    finance: Finance | None = None

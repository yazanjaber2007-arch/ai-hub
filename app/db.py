from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def utcnow() -> datetime:
    """Naive UTC, so SQLite and Postgres behave the same."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Brief(Base):
    __tablename__ = "briefs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="brief")
    priority: Mapped[str] = mapped_column(String(16), default="normal")
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    items: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    created_by: Mapped[str] = mapped_column(String(64), default="claude")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[str] = mapped_column(Text, default="")
    wake_status: Mapped[str] = mapped_column(String(200), default="")


class Synthesis(Base):
    __tablename__ = "syntheses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    content: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class SnapshotRow(Base):
    """Latest structured state per bot (overwritten each run)."""
    __tablename__ = "snapshots"
    bot: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Approval(Base):
    __tablename__ = "approvals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bot: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[str] = mapped_column(String(40), default="")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Audit(Base):
    """Append-only record of who did what."""
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    actor: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(32), index=True)
    target: Mapped[str] = mapped_column(String(64), default="")
    detail: Mapped[str] = mapped_column(String(300), default="")


class BotSeen(Base):
    __tablename__ = "bot_seen"
    bot: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


_engine = None
SessionLocal: sessionmaker | None = None


def init_db(url: str) -> None:
    global _engine, SessionLocal
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {"pool_pre_ping": True}
    _engine = create_engine(url, **kwargs)
    SessionLocal = sessionmaker(_engine, expire_on_commit=False)
    Base.metadata.create_all(_engine)


def session():
    assert SessionLocal is not None, "init_db() not called"
    return SessionLocal()

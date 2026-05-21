"""
migrate.py — Lightweight SQLite migrations for local dev.

`Base.metadata.create_all` creates new tables but does NOT add columns to
existing tables. For local development we run idempotent ALTER TABLE checks
on startup; when we move to a managed DB later, swap this for Alembic.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine

from axalon.db.models import Base


def _has_column(engine: Engine, table: str, column: str) -> bool:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(row[1] == column for row in rows)


def _table_exists(engine: Engine, table: str) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name=:n"),
            {"n": table},
        ).fetchone()
    return row is not None


def run_migrations(engine: Engine) -> list[str]:
    """Apply local schema migrations. Returns a list of actions taken.

    Idempotent: safe to call on every startup. Only handles SQLite.
    """
    actions: list[str] = []

    # Make sure all currently-declared tables exist.
    Base.metadata.create_all(engine)

    # Add Detection.fault_id if missing (older DBs predate fault tracking).
    if _table_exists(engine, "detections") and not _has_column(engine, "detections", "fault_id"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE detections ADD COLUMN fault_id INTEGER REFERENCES panel_faults(id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_detections_fault_id ON detections(fault_id)"))
        actions.append("added detections.fault_id")

    return actions

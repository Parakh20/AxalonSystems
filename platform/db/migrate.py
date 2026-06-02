"""
migrate.py — Lightweight SQLite migrations for local dev.

`Base.metadata.create_all` creates new tables but does NOT add columns to
existing tables. For local development we run idempotent ALTER TABLE checks
on startup; when we move to a managed DB later, swap this for Alembic.
"""
from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from axalon.db.models import Base


def _has_column(engine: Engine, table: str, column: str) -> bool:
    # inspect() is dialect-agnostic — works on SQLite and PostgreSQL alike,
    # unlike the SQLite-only PRAGMA table_info().
    return any(col["name"] == column for col in inspect(engine).get_columns(table))


def _table_exists(engine: Engine, table: str) -> bool:
    # inspect().has_table() replaces the SQLite-only sqlite_master lookup so this
    # runs on PostgreSQL (Supabase) too.
    return inspect(engine).has_table(table)


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

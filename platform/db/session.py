"""Database session management for the Axalon platform."""
import threading
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from axalon.db.models import Base

_engine = None
_SessionLocal = None
_lock = threading.Lock()


def init_db(db_url: str = "sqlite:///axalon.db") -> None:
    """Initialize engine and create all tables. Call once at startup."""
    global _engine, _SessionLocal
    _engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(_engine, "connect")
    def _set_sqlite_pragma(conn, _record):
        conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(_engine)

    # Apply local-dev migrations for columns added to existing tables.
    from axalon.db.migrate import run_migrations
    run_migrations(_engine)

    _SessionLocal = sessionmaker(bind=_engine)


def get_engine():
    """Return the shared engine, initializing it on first call."""
    if _engine is None:
        with _lock:
            if _engine is None:
                init_db()
    return _engine


def get_session():
    """Return a new SQLAlchemy session. Caller is responsible for closing."""
    if _SessionLocal is None:
        with _lock:
            if _SessionLocal is None:
                init_db()
    return _SessionLocal()


@contextmanager
def session_scope(engine=None):
    """Context manager yielding a session that auto-commits/rolls back on exit."""
    session = get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

"""Database session management for the Axalon platform."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from axalon.db.models import Base

_engine = None
_SessionLocal = None


def init_db(db_url: str = "sqlite:///axalon.db") -> None:
    """Initialize engine and create all tables. Call once at startup."""
    global _engine, _SessionLocal
    _engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine)


def get_session():
    """Return a new SQLAlchemy session. Caller is responsible for closing."""
    if _SessionLocal is None:
        init_db()
    return _SessionLocal()

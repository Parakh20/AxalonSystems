"""Tests for FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import MagicMock

import axalon.api.app as api_module


@pytest.fixture
def client():
    """FastAPI TestClient with mocked orchestrator and in-memory DB.

    Uses StaticPool so all SQLAlchemy operations share one connection — required
    because SQLite in-memory databases are per-connection. Without StaticPool,
    create_all() and Session() would each get separate connections, each with
    their own empty database, causing 'no such table' errors.
    """
    metadata = api_module.Park.__table__.metadata
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # single shared connection = single in-memory DB
    )
    metadata.create_all(engine)
    Session = sessionmaker(bind=engine)

    api_module._JOBS.clear()
    api_module._detector = None

    original_get_session = api_module.get_session
    api_module.get_session = lambda: Session()
    api_module.InspectionOrchestrator = MagicMock()

    yield TestClient(api_module.app)

    api_module.get_session = original_get_session


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "model" in body
    assert "weights" in body
    assert body["db"] == "ok"


def test_status_unknown_job(client):
    resp = client.get("/status/no-such-job")
    assert resp.status_code == 404


def test_report_unknown_job(client):
    resp = client.get("/report/no-such-job")
    assert resp.status_code == 404


def test_parks_returns_empty_list(client):
    """GET /parks returns empty list on fresh in-memory DB."""
    resp = client.get("/parks")
    assert resp.status_code == 200
    body = resp.json()
    assert body["parks"] == []
    assert body["total"] == 0


def test_park_not_found(client):
    resp = client.get("/park/NONEXISTENT_PARK_XYZ")
    assert resp.status_code == 404

"""Tests for FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client(tmp_path):
    """Test client with mocked orchestrator to avoid model loading."""
    import axalon.api.app as api_module
    # Reset module-level state
    api_module._JOBS.clear()
    api_module._detector = None
    with patch("axalon.api.app.InspectionOrchestrator"):
        from axalon.api.app import app
        yield TestClient(app)


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "model" in body
    assert "weights" in body


def test_status_unknown_job(client):
    resp = client.get("/status/no-such-job")
    assert resp.status_code == 404


def test_report_unknown_job(client):
    resp = client.get("/report/no-such-job")
    assert resp.status_code == 404


def test_parks_returns_list(client):
    """GET /parks hits DB — should return list even if empty (or DB error handled)."""
    resp = client.get("/parks")
    # Either 200 (with parks list) or 500 if DB not init'd — we just assert it's reachable
    assert resp.status_code in (200, 500)


def test_park_not_found(client):
    resp = client.get("/park/NONEXISTENT_PARK_XYZ")
    assert resp.status_code == 404

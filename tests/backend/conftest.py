"""Shared pytest fixtures: temp DB, FastAPI TestClient, batch helper."""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = REPO_ROOT / "tests" / "fixtures" / "sample_mission"


@pytest.fixture(scope="session")
def sample_mission_zip(tmp_path_factory) -> Path:
    """Build a fresh ZIP of the synthetic mission for upload tests."""
    if not FIXTURE_DIR.exists():
        raise RuntimeError(
            f"Synthetic mission fixture missing at {FIXTURE_DIR}. "
            f"Run: python scripts/make_sample_mission.py"
        )
    out_dir = tmp_path_factory.mktemp("missions")
    out_zip = out_dir / "sample_mission.zip"
    shutil.make_archive(str(out_zip)[:-4], "zip", root_dir=FIXTURE_DIR.parent, base_dir=FIXTURE_DIR.name)
    return out_zip


@pytest.fixture
def temp_db(monkeypatch, tmp_path) -> Path:
    """Point the app at a temp SQLite DB for the duration of one test."""
    db_path = tmp_path / "test_axalon.db"
    monkeypatch.setenv("AXALON_DB_URL", f"sqlite:///{db_path}")
    # Reset module-level engine caches if present
    from axalon.db import session as _session
    if hasattr(_session, "_engine"):
        _session._engine = None
    if hasattr(_session, "_SessionLocal"):
        _session._SessionLocal = None
    yield db_path


@pytest.fixture
def client(temp_db) -> TestClient:
    """FastAPI TestClient bound to a fresh in-test DB."""
    # Import inside the fixture so AXALON_DB_URL is set first.
    from axalon.api.app import app
    return TestClient(app)


@pytest.fixture
def db_session(temp_db):
    """SQLAlchemy session bound to the temp test DB."""
    from axalon.db.session import get_session
    session = get_session()
    yield session
    session.close()


@pytest.fixture
def batch_fixture(client, sample_mission_zip):
    """Run one batch end-to-end through the API and return its job_id."""
    def _run(park_id: str = "TEST_PARK", altitude_m: float = 42.0) -> str:
        with open(sample_mission_zip, "rb") as f:
            r = client.post(
                "/batch",
                files={"images": ("sample_mission.zip", f, "application/zip")},
                data={"park_id": park_id, "altitude_m": str(altitude_m)},
            )
        assert r.status_code == 202, r.text
        job_id = r.json()["job_id"]
        # Wait for completion (synchronous in TestClient runtime)
        for _ in range(300):
            s = client.get(f"/status/{job_id}").json()
            if s.get("state") in ("succeeded", "completed", "failed"):
                break
            import time
            time.sleep(0.5)
        return job_id
    return _run

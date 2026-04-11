"""Tests for InspectionOrchestrator — mocked to avoid real model/GPU dependency."""
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_detector():
    """SolarDetector mock that returns one CRITICAL detection per image."""
    det = {
        "class": "hot-spot-high",
        "class_id": 10,
        "severity": "CRITICAL",
        "confidence": 0.91,
        "bbox": [10, 20, 50, 60],
        "bbox_norm": [0.3, 0.4, 0.2, 0.2],
        "color_bgr": (0, 0, 255),
        "gps": None,
    }
    mock = MagicMock()
    mock.predict.return_value = [det]
    mock.detection_summary.return_value = {"CRITICAL": 1, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    return mock


@pytest.fixture
def orchestrator(tmp_path, mock_detector):
    """Orchestrator with mocked detector and in-memory DB. Resets global DB state on teardown."""
    with patch("axalon.pipeline.orchestrator.SolarDetector", return_value=mock_detector):
        from axalon.pipeline.orchestrator import InspectionOrchestrator
        orch = InspectionOrchestrator(
            output_dir=tmp_path / "output",
            db_url="sqlite:///:memory:",
        )
    orch.detector = mock_detector
    yield orch
    # Reset global engine so subsequent tests start with a clean slate
    import axalon.db.session as _sess
    _sess._engine = None
    _sess._SessionLocal = None


def test_match_panel_id_nearest():
    from axalon.pipeline.orchestrator import _match_panel_id
    panel_map = {
        "R1-C1": {"center": [10, 10], "bbox_image": [0, 0, 20, 20], "gps": None},
        "R1-C2": {"center": [100, 10], "bbox_image": [80, 0, 120, 20], "gps": None},
    }
    det = {"bbox": [5, 5, 15, 15]}  # center at (10, 10) — nearest to R1-C1
    assert _match_panel_id(det, panel_map) == "R1-C1"

    det2 = {"bbox": [90, 5, 110, 15]}  # center at (100, 10) — nearest to R1-C2
    assert _match_panel_id(det2, panel_map) == "R1-C2"


def test_match_panel_id_empty_map():
    from axalon.pipeline.orchestrator import _match_panel_id
    assert _match_panel_id({"bbox": [0, 0, 10, 10]}, {}) == "R?-C?"


def test_inspect_pair_assigns_panel_id(orchestrator, tmp_path):
    """inspect_pair assigns panel_id from panel_map."""
    import cv2
    import numpy as np
    # Create a minimal thermal image
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    thermal = tmp_path / "thermal_001.jpg"
    cv2.imwrite(str(thermal), img)

    panel_map = {
        "R1-C1": {"center": [30, 40], "bbox_image": [0, 0, 60, 80], "gps": None},
    }
    result = orchestrator.inspect_pair(
        thermal_path=thermal,
        panel_map=panel_map,
    )
    assert result["detections"][0]["panel_id"] == "R1-C1"


def test_ensure_park_idempotent(orchestrator):
    """_ensure_park must not raise or double-insert when called twice for the same park_id."""
    from axalon.pipeline.orchestrator import _ensure_park
    from axalon.db.session import get_session
    from axalon.db.models import Park

    layout = {"rows": 4, "total_panels": 20, "mode": "auto", "panel_map": {}}
    session = get_session()
    _ensure_park(session, "PARK-IDEM", layout)
    session.close()

    # Second call must not raise (PK violation would propagate as IntegrityError)
    session = get_session()
    _ensure_park(session, "PARK-IDEM", layout)
    count = session.query(Park).filter_by(id="PARK-IDEM").count()
    session.close()
    assert count == 1


def test_inspect_pair_persists_to_db(orchestrator, tmp_path):
    """inspect_pair writes Detection rows when inspection_id is provided."""
    import cv2
    import numpy as np
    from axalon.db.session import get_session
    from axalon.db.models import Park, Inspection, Detection as DbDetection

    img = np.zeros((100, 100, 3), dtype=np.uint8)
    thermal = tmp_path / "thermal_002.jpg"
    cv2.imwrite(str(thermal), img)

    # Pre-insert required Park and Inspection rows (FK deps)
    session = get_session()
    session.add(Park(id="PARK_T", name="Test", mode="auto"))
    session.flush()
    session.add(Inspection(
        id="BATCH-TEST-001",
        park_id="PARK_T",
        flight_date="2026-04-11",
        total_images=1,
        total_detections=0,
        summary="{}",
    ))
    session.commit()
    session.close()

    orchestrator.inspect_pair(
        thermal_path=thermal,
        inspection_id="BATCH-TEST-001",
    )

    session = get_session()
    dets = session.query(DbDetection).filter_by(inspection_id="BATCH-TEST-001").all()
    assert len(dets) == 1
    assert dets[0].severity == "CRITICAL"
    session.close()

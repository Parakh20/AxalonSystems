"""Tests for SQLAlchemy database layer."""
import json
import pytest
from datetime import datetime


def test_models_importable():
    from axalon.db.models import Base, Park, Inspection, Detection
    assert Park.__tablename__ == "parks"
    assert Inspection.__tablename__ == "inspections"
    assert Detection.__tablename__ == "detections"


def test_init_db_creates_tables():
    from axalon.db.session import init_db, get_session
    init_db("sqlite:///:memory:")
    session = get_session()
    # verify tables exist by querying them
    assert session.query(__import__("axalon.db.models", fromlist=["Park"]).Park).count() == 0
    session.close()


def test_create_park():
    from axalon.db.session import init_db, get_session
    from axalon.db.models import Park
    init_db("sqlite:///:memory:")
    session = get_session()
    park = Park(id="PARK_01", name="Test Farm", mode="auto", total_panels=120, rows=10, cols=12)
    session.add(park)
    session.commit()
    retrieved = session.query(Park).filter_by(id="PARK_01").first()
    assert retrieved is not None
    assert retrieved.name == "Test Farm"
    assert retrieved.total_panels == 120
    session.close()


def test_create_inspection_and_detection():
    from axalon.db.session import init_db, get_session
    from axalon.db.models import Park, Inspection, Detection
    init_db("sqlite:///:memory:")
    session = get_session()
    park = Park(id="PARK_02", name="Alpha Farm", mode="auto")
    session.add(park)
    insp = Inspection(
        id="BATCH-PARK_02-20260411-120000",
        park_id="PARK_02",
        flight_date="2026-04-11",
        total_images=10,
        total_detections=3,
        summary=json.dumps({"CRITICAL": 1, "HIGH": 1, "MEDIUM": 1, "LOW": 0}),
    )
    session.add(insp)
    det = Detection(
        inspection_id="BATCH-PARK_02-20260411-120000",
        image_id="thermal_001",
        panel_id="R3-C7",
        class_="hot-spot-high",
        class_id=10,
        severity="CRITICAL",
        confidence=0.87,
        bbox=json.dumps([100, 200, 150, 250]),
        gps=json.dumps({"lat": 28.4, "lon": 77.1}),
    )
    session.add(det)
    session.commit()
    detections = session.query(Detection).filter_by(inspection_id="BATCH-PARK_02-20260411-120000").all()
    assert len(detections) == 1
    assert detections[0].severity == "CRITICAL"
    assert detections[0].panel_id == "R3-C7"
    session.close()


def test_get_session_auto_inits():
    """get_session() should work even if init_db() was never called explicitly."""
    # Reset module state first
    import axalon.db.session as sess_mod
    sess_mod._engine = None
    sess_mod._SessionLocal = None
    session = sess_mod.get_session()
    assert session is not None
    session.close()

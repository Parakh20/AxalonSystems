"""health router — extracted from app.py (Plan 01)."""
from __future__ import annotations

from fastapi import APIRouter
from axalon.api.deps import *  # noqa: F401,F403

router = APIRouter(tags=["health"])

@router.get("/health")
def health():
    try:
        session = get_session()
        try:
            park_count = session.query(Park).count()
            db_status = "ok"
        finally:
            session.close()
    except Exception:
        logger.exception("Health check DB query failed")
        park_count = 0
        db_status = "error"
    return {
        "status": "ok",
        "model": "YOLO11m",
        "weights": "ml/checkpoints/best.pt",
        "version": "1.0.0",
        "db": db_status,
        "parks_in_db": park_count,
    }

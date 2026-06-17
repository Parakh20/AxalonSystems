"""analytics router — extracted from app.py (Plan 01)."""
from __future__ import annotations

from fastapi import APIRouter
from axalon.api.deps import *  # noqa: F401,F403

router = APIRouter(tags=["analytics"])

@router.get("/analytics/overview")
def analytics_overview():
    """All parks with their severity trends in ONE call — replaces the
    frontend's per-park /park/{id}/trend fan-out on the Overview tab."""
    from sqlalchemy import text
    from axalon.park.trend import build_trend

    session = get_session()
    try:
        parks = session.query(Park).order_by(Park.id.asc()).all()
        if not parks:
            return []
        rows = session.execute(
            text("""
                SELECT i.park_id,
                       i.id,
                       i.flight_date,
                       SUM(CASE WHEN d.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
                       SUM(CASE WHEN d.severity = 'HIGH'     THEN 1 ELSE 0 END) AS high_count,
                       SUM(CASE WHEN d.severity = 'MEDIUM'   THEN 1 ELSE 0 END) AS medium_count,
                       SUM(CASE WHEN d.severity = 'LOW'      THEN 1 ELSE 0 END) AS low_count
                FROM inspections i
                LEFT JOIN detections d ON d.inspection_id = i.id
                GROUP BY i.park_id, i.id, i.flight_date
            """)
        ).fetchall()
        rows_by_park: dict[str, list] = {}
        for row in rows:
            rows_by_park.setdefault(row.park_id, []).append(row)
        return [
            {
                "park": {"id": p.id, "name": p.name},
                "trend": build_trend(rows_by_park.get(p.id, [])),
            }
            for p in parks
        ]
    finally:
        session.close()

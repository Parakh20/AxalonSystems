"""faults router — extracted from app.py (Plan 01)."""
from __future__ import annotations

from fastapi import APIRouter
from axalon.api.deps import *  # noqa: F401,F403
from axalon.api.schemas.responses import CommentOut, FaultsListOut
from axalon.api.schemas import CommentCreate, FaultUpdate

router = APIRouter(tags=["faults"])

@router.get("/parks/{park_id}/faults", response_model=FaultsListOut)
def list_park_faults(park_id: str, status: str | None = None):
    """List tracked faults for a park, optionally filtered by status."""
    park_id = _validate_park_id(park_id)
    if status is not None and status not in _ALLOWED_FAULT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(_ALLOWED_FAULT_STATUSES))}",
        )
    session = get_session()
    try:
        q = session.query(PanelFault).filter(PanelFault.park_id == park_id)
        if status:
            q = q.filter(PanelFault.status == status)
        # Worst severity first, then most-recently-seen.
        faults = q.order_by(
            PanelFault.severity.desc(), PanelFault.last_seen_date.desc()
        ).all()
        counts = {s: 0 for s in _ALLOWED_FAULT_STATUSES}
        for f in faults:
            if f.status in counts:
                counts[f.status] += 1
        from sqlalchemy import func
        comment_counts = dict(
            session.query(FaultComment.fault_id, func.count(FaultComment.id))
            .filter(FaultComment.fault_id.in_([f.id for f in faults]))
            .group_by(FaultComment.fault_id)
            .all()
        ) if faults else {}
        return {
            "park_id": park_id,
            "total": len(faults),
            "counts_by_status": counts,
            "faults": [_serialize_fault(f, comment_counts.get(f.id, 0)) for f in faults],
        }
    finally:
        session.close()


@router.patch("/faults/{fault_id}")
def update_fault(fault_id: int, payload: FaultUpdate):
    """Update fault status (e.g. mark resolved) or append notes."""
    payload = payload.model_dump(exclude_unset=True)
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    new_status = payload.get("status")
    notes = payload.get("notes")
    if new_status is not None and new_status not in _ALLOWED_FAULT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(_ALLOWED_FAULT_STATUSES))}",
        )
    session = get_session()
    try:
        fault = session.query(PanelFault).filter_by(id=fault_id).first()
        if fault is None:
            raise HTTPException(status_code=404, detail="Fault not found")
        if new_status:
            fault.status = new_status
        if notes is not None:
            fault.notes = str(notes)[:2000]
        session.commit()
        return _serialize_fault(fault)
    finally:
        session.close()


@router.post("/faults/{fault_id}/comments", status_code=201)
def create_fault_comment(fault_id: int, body: CommentCreate):
    """Append a comment to a fault's thread."""
    body = body.model_dump(exclude_unset=True)
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    comment_body = str(body.get("body", "")).strip()
    if not comment_body:
        raise HTTPException(status_code=400, detail="body is required")
    author = str(body.get("author", ""))[:128] if body.get("author") else None
    session = get_session()
    try:
        fault = session.query(PanelFault).filter_by(id=fault_id).first()
        if fault is None:
            raise HTTPException(status_code=404, detail="Fault not found")
        comment = FaultComment(
            fault_id=fault_id,
            author=author,
            body=comment_body[:4000],
        )
        session.add(comment)
        session.commit()
        session.refresh(comment)
        return JSONResponse(content=_serialize_comment(comment), status_code=201)
    finally:
        session.close()


@router.get("/faults/{fault_id}/comments", response_model=list[CommentOut])
def list_fault_comments(fault_id: int):
    """List all comments on a fault in chronological order."""
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    session = get_session()
    try:
        comments = (
            session.query(FaultComment)
            .filter(FaultComment.fault_id == fault_id)
            .order_by(FaultComment.created_at.asc(), FaultComment.id.asc())
            .all()
        )
        return [_serialize_comment(c) for c in comments]
    finally:
        session.close()

"""settings router — extracted from app.py (Plan 01)."""
from __future__ import annotations

from fastapi import APIRouter
from axalon.api.deps import *  # noqa: F401,F403
from axalon.api.schemas import SettingsUpdate

router = APIRouter(tags=["settings"])

@router.get("/settings")
def get_settings():
    """Return current platform settings.yaml as JSON."""
    try:
        import yaml  # lazy — keep top-level imports lean
        if not _SETTINGS_PATH.exists():
            raise HTTPException(404, "settings.yaml not found")
        with _SETTINGS_PATH.open("r") as f:
            data = yaml.safe_load(f) or {}
        return {"settings": data, "path": str(_SETTINGS_PATH)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to read settings.yaml")
        raise HTTPException(500, f"Failed to read settings: {exc}")


@router.put("/settings")
def update_settings(payload: SettingsUpdate):
    """Overwrite settings.yaml with the provided dict (top-level key 'settings').

    Sync `def` (not `async def`): the body only does blocking file I/O, so
    FastAPI runs it in its thread pool instead of stalling the event loop.
    """
    payload = payload.model_dump(exclude_unset=True)
    try:
        import yaml
        new_settings = payload.get("settings") if isinstance(payload, dict) else None
        if not isinstance(new_settings, dict):
            raise HTTPException(400, "Body must be {'settings': {...}}")
        # Atomic write: temp file → rename
        tmp = _SETTINGS_PATH.with_suffix(".yaml.tmp")
        with tmp.open("w") as f:
            yaml.safe_dump(new_settings, f, sort_keys=False, default_flow_style=False)
        tmp.replace(_SETTINGS_PATH)
        return {"ok": True, "path": str(_SETTINGS_PATH)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to write settings.yaml")
        raise HTTPException(500, f"Failed to write settings: {exc}")

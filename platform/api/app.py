"""FastAPI shell for the Axalon Solar Inspection Platform.

Lifespan, CORS, auth/timeout middleware, router wiring. Endpoints live in
axalon.api.routers.*; shared helpers in axalon.api.deps.
Run: uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from axalon.api.deps import (
    logger, get_session, DbJob, _run_alembic_migrations, _cleanup_old_results,
)
from axalon.api.agents_router import router as agents_router
from axalon.api.routers import (
    alerts, analytics, corrections, diff, faults, health, inspection, inventory,
    map, missions, ortho, park, projects, results, settings, track, work_orders,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_alembic_migrations()
    _requeue_stale_jobs()
    try:
        _cleanup_old_results()
    except Exception:
        # Same reasoning as _requeue_stale_jobs: housekeeping must never be the
        # reason the API refuses to start.
        logger.exception("Startup: results cleanup failed")
    yield


def _requeue_stale_jobs() -> None:
    """Re-queue jobs left 'running' by a previous process.

    Never raises. An unreachable database used to propagate out of lifespan and
    abort startup, so a single stale connection string took the whole API down
    and every request returned 503 with no way to see why. Logging and carrying
    on keeps the app serving, and /health reports db:"error" so the cause is
    visible instead of opaque.
    """
    try:
        session = get_session()
    except Exception:
        logger.exception("Startup: database unreachable — continuing without re-queue")
        return
    try:
        stale = session.query(DbJob).filter(DbJob.state == "running").all()
        for job in stale:
            job.state = "queued"
            job.message = "Re-queued after API restart"
        session.commit()
        if stale:
            logger.info("Re-queued %s interrupted job(s)", len(stale))
    except Exception:
        session.rollback()
        logger.exception("Startup: could not re-queue interrupted jobs")
    finally:
        session.close()


app = FastAPI(
    title="Axalon Solar Inspection API",
    version="1.0.0",
    lifespan=lifespan,
    description=(
        "Solar anomaly detection and panel localization for drone-captured "
        "thermal IR + RGB imagery. Powered by YOLO11m (best.pt)."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────────────
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001",
    "http://127.0.0.1:3001", "http://localhost:8501", "http://127.0.0.1:8501",
    "https://axalonsystems.com", "https://www.axalonsystems.com",
]
_CORS_ORIGINS = [
    o.strip() for o in os.getenv("AXALON_CORS_ORIGINS", "").split(",") if o.strip()
] or _DEFAULT_CORS_ORIGINS

# Any loopback port counts as a dev origin. Without this, running the Next.js dev
# server on anything but :3000/:3001 (port already taken, parallel worktree, a
# second UI) fails every request with an opaque CORS error instead of a 4xx.
# Safe: allow_credentials is False and auth is a Bearer header, never a cookie,
# so a cross-origin page gains nothing it could not already request directly.
_CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

app.include_router(agents_router)
app.add_middleware(
    CORSMiddleware, allow_origins=_CORS_ORIGINS,
    allow_origin_regex=_CORS_ORIGIN_REGEX, allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["*"],
)

_REQUEST_TIMEOUT_S = 120


@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path in ("/health", "/track/login") or request.method == "OPTIONS":
        return await call_next(request)
    api_key = os.environ.get("AXALON_API_KEY", "").strip()
    supplied_key = request.query_params.get("api_key")
    if api_key and request.headers.get("authorization") != f"Bearer {api_key}" and supplied_key != api_key:
        return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)
    return await call_next(request)


@app.middleware("http")
async def timeout_middleware(request, call_next):
    """Return 504 if a request exceeds _REQUEST_TIMEOUT_S (after auth → outermost layer)."""
    import asyncio
    try:
        return await asyncio.wait_for(call_next(request), timeout=_REQUEST_TIMEOUT_S)
    except asyncio.TimeoutError:
        return JSONResponse({"detail": "Request timeout"}, status_code=504)


# ── Domain routers ──────────────────────────────────────────────────────────────
for _module in (
    alerts, analytics, corrections, diff, faults, health, inspection, inventory,
    map, missions, ortho, park, projects, results, settings, track, work_orders,
):
    app.include_router(_module.router)

---
name: platform-api
description: Use when adding or modifying FastAPI endpoints in platform/api/app.py — request/response shapes, Bearer auth, CORS, error handling, and the platform/ module-shadow gotcha. Read before changing the backend surface.
---

# Platform API (FastAPI)

The backend lives in `platform/api/app.py` (package name `axalon`, so the import path is `axalon.api.app:app`). It serves the `/platform` UI and is deployed to a Hugging Face Space (see `cloud-deployment`).

## Run locally
```bash
# platform/ shadows the stdlib `platform` module — ALWAYS use PYTHONSAFEPATH=1,
# ideally with cwd /tmp, or SQLAlchemy/uvicorn crash on import.
PYTHONSAFEPATH=1 uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000
# or ./run.sh all  (API + Next.js platform UI)
```

## Auth — `require_auth`
```python
# No-op when AXALON_API_KEY is unset; otherwise requires `Authorization: Bearer <key>`.
def require_auth(creds = Security(_bearer)) -> None: ...
```
- Attach `dependencies=[Depends(require_auth)]` (or `Security`) to protected routes.
- The frontend (`AuthGate.tsx` + `lib/api.ts`) sends `Authorization: Bearer <key>` from `sessionStorage` and pops a prompt on 401.
- The key is an **encrypted HF Space secret**, never in the frontend/git.

## Endpoint groups (current)
- `GET /health` — model + db status (public).
- Jobs / inference, parks, inspections, diff.
- Missions: `POST/GET/DELETE /missions` (drone plans — see `mission-planner`).
- Reports: `GET /report/{jobId}?format=…` (see `reporting`).

## Adding an endpoint
1. Use the response envelope conventions already in `app.py`; raise `HTTPException` for errors (never swallow).
2. Validate input at the boundary (Pydantic / explicit checks).
3. Protect mutating routes with `require_auth`.
4. DB access via `get_session()` (see `database` skill) — always `session.close()` in `finally`.
5. Add a test under `tests/`; run `PYTHONSAFEPATH=1 python -m pytest`.

## Gotchas
- CORS already allows `axalonsystems.com` — extend the list in `app.py` if adding origins.
- `NEXT_PUBLIC_AXALON_API_URL` (Vercel) must point at the live backend; it's baked at build time.
- Don't cross-import website code. Detection logic comes from `platform/core` + `ml.src.utils`.

# Deployment Runbook — Axalon Inspection Platform

## Prerequisites

- `ml/checkpoints/best.pt` present for real inference.
- Docker Engine 24+ and Docker Compose v2.
- Ports `3000` and `8000` free.

## Local Docker Deployment

```bash
python3 scripts/make_sample_mission.py
cd tests/fixtures && zip -rq sample_mission.zip sample_mission/ && cd -

# Optional: populate History, Park Map, and Diff with demo data.
python3 scripts/seed_demo_data.py

# Optional: require API-key auth.
export AXALON_API_KEY=your-secret-key

docker compose build
docker compose up -d
```

Open `http://localhost:3000/platform`.

## Environment Variables

| Variable | Service | Default | Description |
|---|---|---|---|
| `AXALON_API_KEY` | API | empty | Bearer key required on all non-health endpoints when set |
| `AXALON_TRACK_PASSWORD` | API | empty | Password for the `/track` workspace login (`POST /track/login`). Login returns 503 until set. Never put this in a `NEXT_PUBLIC_*` var |
| `SUPABASE_URL` | API | empty | Supabase project URL — enables durable Supabase Storage for `/track` files (otherwise local disk) |
| `SUPABASE_SERVICE_KEY` | API | empty | Supabase service-role key for the storage bucket. Server-side only — never expose to the frontend |
| `AXALON_TRACK_BUCKET` | API | `track-files` | Supabase Storage bucket name for `/track` uploads |
| `AXALON_DB_URL` | API | `sqlite:////app/data/axalon.db` in Docker | SQLAlchemy database URL |
| `AXALON_OUTPUT_DIR` | API | `/app/data/output` in Docker | Generated reports and job artifacts |
| `NEXT_PUBLIC_AXALON_API_URL` | Next.js | `http://localhost:8000` | API base URL used by the browser |

## Auth

When `AXALON_API_KEY` is set, `/health` stays public and every other endpoint requires:

```http
Authorization: Bearer your-secret-key
```

The platform UI opens an unlock dialog after a `401` and stores the key in `sessionStorage`.

## Persistence

Docker stores SQLite and generated reports in the `axalon_data` volume. Batch job state is stored in the `jobs` table, so `/status/{job_id}` survives API container restarts.

```bash
docker compose restart api
```

## Render.com Direction

For the API, create a Docker Web Service using the root `Dockerfile`. Attach persistent storage and set:

- `AXALON_API_KEY`
- `AXALON_DB_URL`
- `AXALON_OUTPUT_DIR`

For the frontend, deploy `website/nextjs` as a Node/Next service and set `NEXT_PUBLIC_AXALON_API_URL` to the public API URL.

## Model Weights In CI

The e2e GitHub Actions job needs `ml/checkpoints/best.pt` for real inference. Preferred: store weights in Git LFS and run `git lfs pull` before the e2e job. If weights are unavailable, CI creates a zero-byte placeholder and runs the Playwright flow with `PLAYWRIGHT_CI=1`, accepting a failed batch as a terminal UI smoke-test state.

## Stopping

```bash
docker compose down
docker compose down -v  # also deletes the persisted DB volume
```

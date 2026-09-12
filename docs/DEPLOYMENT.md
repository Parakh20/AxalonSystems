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
| `AXALON_NODEODM_URL` | API | empty | Base URL of a NodeODM server (e.g. `http://nodeodm:3000`). Enables in-platform orthomosaic generation; when unset the feature is disabled and `/health` reports `capabilities.odm.configured: false` |
| `AXALON_NODEODM_TOKEN` | API | empty | Optional NodeODM access token (NodeODM started with `--token`). Sent as the `token` query parameter; server-side only |
| `NEXT_PUBLIC_AXALON_API_URL` | Next.js | `http://localhost:8000` | API base URL used by the browser |

## Orthomosaic Generation (NodeODM)

The Park Map's **Generate orthomosaic** button stitches drone images into a GeoTIFF on an
[OpenDroneMap NodeODM](https://github.com/OpenDroneMap/NodeODM) server, then registers the result
exactly like a manually uploaded ortho (tiles and fault overlays work unchanged).

Run NodeODM next to the API:

```bash
# NodeODM listens on 3000 inside the container; publish it on 3001 locally so it
# does not collide with the Next.js UI on 3000.
docker run -d --name nodeodm -p 3001:3000 opendronemap/nodeodm
export AXALON_NODEODM_URL=http://localhost:3001
# Optional: docker run ... opendronemap/nodeodm --token s3cret  and
# export AXALON_NODEODM_TOKEN=s3cret
```

On a dedicated host the stock command is `docker run -p 3000:3000 opendronemap/nodeodm`. Keep
NodeODM on a private network — only the API talks to it.

Input and behaviour:

- Operators upload a ZIP (≤ 2 GB, same limits as batch uploads) or reuse the images of an existing
  inspection job. One camera per ortho: `rgb/` is preferred, `thermal/` is used when it is the only
  set, and flat folders are split by `_T`/`_V` style names.
- At least 5 images must carry GPS EXIF, otherwise the job fails before anything is sent to NodeODM.
- Default task options: `fast-orthophoto` on (solar parks are planar), `orthophoto-resolution` 2 cm/px,
  `dsm` off, `skip-3dmodel`, `auto-boundary`.
- Jobs are ordinary `jobs` rows (`odm-…`). Status is polled every 15 s; cancelling removes the NodeODM
  task. After an API restart, jobs already on NodeODM resume polling; jobs interrupted before
  submission are marked failed and must be restarted. Resumption assumes a single API worker process.

Hardware expectations (NodeODM, fast-orthophoto):

| Images (20 MP) | RAM | CPU | Disk (scratch) | Typical time |
|---|---|---|---|---|
| ≤ 200 | 8 GB | 4 cores | 20 GB | 10–30 min |
| 200–1,000 | 16–32 GB | 8 cores | 50–100 GB | 1–3 h |
| 1,000–3,000 | 64 GB+ | 16 cores | 200 GB+ | several hours |

Full (non-fast) reconstructions need roughly 2× the RAM and time. Radiometric 640×512 thermal
frames stitch poorly on their own — fly RGB alongside thermal and generate the ortho from RGB. NodeODM
does not run on the free Hugging Face Space; point `AXALON_NODEODM_URL` at a separate VM.

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

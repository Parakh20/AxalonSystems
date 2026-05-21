# Deployment Guide

## Phase 1: Local machine

```bash
pip install -r ml/requirements.txt
pip install -r requirements_platform.txt
pip install -e .

./run.sh both
```

Local URLs:

- Dashboard: `http://localhost:8501`
- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

## Phase 2: Docker on a VM

This repo already includes `Dockerfile` and `docker-compose.yml`.

```bash
git clone <repo-url> AxalonSystems
cd AxalonSystems
docker compose up -d --build
```

Mounted data:

- `./ml/checkpoints` into the container for model weights
- `./output` for generated reports
- `axalon_db` volume for the SQLite database

Exposed services:

- Dashboard on port `8501`
- API on port `8000`

Current deployment caveats:

- `docker-compose.yml` still runs the API with `--reload`
- `depends_on` does not wait for API readiness
- HTTPS termination is not included yet

Those follow-up items are tracked in `docs/improvements.md`.

## Phase 3: Production hardening

Recommended before public exposure:

1. Put NGINX or Caddy in front for HTTPS and access control.
2. Add API authentication and rate limiting.
3. Replace SQLite with PostgreSQL.
4. Add object storage for generated report artifacts.

## PostgreSQL direction

The current platform uses SQLite by default. The docs and backlog already anticipate a future `DATABASE_URL`-style production setup, but that change is not fully wired in yet, so treat PostgreSQL as planned work rather than current copy-paste deployment.

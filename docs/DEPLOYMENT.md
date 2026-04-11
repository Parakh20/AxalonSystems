# Deployment Guide

## Phase 1 — Local (current)

```bash
pip install -e .
python main.py dashboard    # Streamlit on :8501
python main.py api          # FastAPI on :8000
```

## Phase 2 — Cloud VM (Docker)

```bash
# On your VM
git clone <repo> AxalonSystems
cd AxalonSystems
cp ml/checkpoints/best.pt ml/checkpoints/   # or mount via volume

docker compose up -d
```

Services:
- Dashboard: http://your-vm-ip:8501
- API: http://your-vm-ip:8000

To use PostgreSQL instead of SQLite, update `platform/config/settings.yaml`:
```yaml
database:
  url: postgresql://axalon:password@db:5432/axalon
```
And add a postgres service to `docker-compose.yml`.

## Phase 3 — Self-Hosted + Multi-tenant

Coming after Phase 2 is stable. Will add:
- Basic API key authentication
- Per-client data isolation
- NGINX reverse proxy + HTTPS

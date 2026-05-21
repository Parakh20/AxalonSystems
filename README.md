# Axalon Systems

Axalon is a thermal-drone solar inspection platform with three working layers:

- `ml/` — YOLOv8s thermal anomaly model
- `platform/` — FastAPI backend, reporting, persistence, orchestration
- `website/nextjs/` — Next.js site + the operator platform UI (route `/platform` on :3000)

## Quick Start

```bash
git clone <repo-url> AxalonSystems
cd AxalonSystems

./run.sh setup         # install ML + platform deps, editable axalon package
```

Place the model at:

```bash
ml/checkpoints/best.pt
```

Start the services:

```bash
./run.sh all           # API on :8000 + platform UI on :3000
```

Local URLs:

- Platform UI: `http://localhost:3000/platform`
- API:         `http://localhost:8000`
- API docs:    `http://localhost:8000/docs`

## Commands

```bash
./run.sh doctor        # environment and dependency checks
./run.sh setup         # install ML deps, platform deps, and editable packages
./run.sh api           # FastAPI only
./run.sh platform      # Next.js platform UI only
./run.sh all           # API + platform UI
./run.sh status        # show what is running
./run.sh stop          # stop background services
```

CLI entrypoints:

```bash
python main.py inspect --thermal /path/to/thermal.jpg --rgb /path/to/rgb.jpg --park-id PARK_01
python main.py batch --folder /path/to/mission --park-id PARK_01 --altitude 45
python main.py api
```

## Mission Folder Expectation

A typical operator workflow:

1. Start the services with `./run.sh all`
2. Open `http://localhost:3000/platform`
3. Point at a local mission folder (thermal + RGB images)
4. Run inspection
5. Download JSON, Excel, GeoJSON, and PDF reports

Generated reports land under:

```bash
output/{batch_id}/
```

## Project Layout

| Directory | Purpose |
|-----------|---------|
| `platform/` | FastAPI API, reporting, DB, orchestration |
| `ml/` | YOLOv8s thermal model, classes, utilities |
| `website/nextjs/` | Next.js marketing site + `/platform` operator UI |
| `docs/` | Operator docs, API reference, platform spec |
| `tests/` | Automated tests |

## Docs

- [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md)
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- [docs/INSTALLATION.md](docs/INSTALLATION.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/AXALON_PLATFORM_SPEC.md](docs/AXALON_PLATFORM_SPEC.md)

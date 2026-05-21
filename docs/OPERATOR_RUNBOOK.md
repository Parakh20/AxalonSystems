# Operator Runbook — Axalon Inspection Platform

The 10-minute walk through a real local inspection from zero.

## Prereqs

- `./run.sh setup` has completed once
- `ml/checkpoints/best.pt` exists (~22 MB)
- Optional: WeasyPrint system libs (for PDF reports). See `docs/INSTALLATION.md`.

## 1. Generate the sample mission

```bash
python scripts/make_sample_mission.py
cd tests/fixtures && zip -rq sample_mission.zip sample_mission/ && cd -
```

You should see `tests/fixtures/sample_mission.zip` (~1–5 MB).

## 2. Start the services

```bash
./run.sh all
```

In another terminal, verify:

```bash
curl -fsS http://localhost:8000/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/platform
```

Both should return `200`.

## 3. Open the platform UI

Open `http://localhost:3000/platform` in a browser.

## 4. Run a batch inspection

On the **Operations** tab:

1. Park ID: `SOLAR_PARK_DEMO`
2. Altitude: `42`
3. Choose file: `tests/fixtures/sample_mission.zip`
4. Click **Start batch**.
5. Wait for progress to reach 100% (~30–90 seconds depending on GPU/CPU).
6. The map below should show markers from the detected anomalies.

## 5. Download reports

Click each of the four report buttons. Files land in your default Downloads folder.

## 6. Inspect a single image

On the **Inspect** tab:

1. Choose file: `tests/fixtures/sample_mission/thermal/img_001.jpg`.
2. Submit. Annotated image + detection list appear.

## 7. Browse history

On the **History** tab:

1. Park dropdown should include `SOLAR_PARK_DEMO`.
2. Select it. You should see the inspection from step 4.

## 8. Tweak settings

On the **Settings** tab:

1. Change confidence to `0.30`.
2. Save.
3. Reload page — value persists.

## Troubleshooting

- **Any silent failure** is a bug. Every failure should produce a visible toast bottom-right of the screen. If it didn't, that's a Phase 1 regression — file it.
- **PDF download fails** — likely WeasyPrint libs missing. Install per `docs/INSTALLATION.md` or use JSON / Excel / GeoJSON instead.
- **No detections in the map** — the synthetic hotspots may not match the trained model distribution. Re-run `python scripts/make_sample_mission.py --seed 12345` to get a fresh batch.

# How to Use Axalon Solar Inspection Platform

## Option 1: Streamlit Dashboard (recommended for operators)

```bash
streamlit run platform/ui/dashboard.py
```

Open http://localhost:8501 in your browser.

**Daily workflow:**
1. Go to **📦 Batch** page
2. Enter Park ID and full path to your flight folder
3. Enter drone altitude
4. Click **Start Batch Inspection**
5. Watch live progress — park grid updates as each image is processed
6. Download PDF, Excel, or GeoJSON reports when done

## Option 2: CLI

```bash
# Inspect entire park folder
python main.py batch \
  --folder /path/to/flight_mission/ \
  --park-id PARK_01 \
  --altitude 45

# Inspect single image pair (debug)
python main.py inspect \
  --thermal /path/to/thermal_001.jpg \
  --rgb /path/to/rgb_001.jpg \
  --park-id PARK_01

# Start REST API server
python main.py api

# Launch Streamlit dashboard
python main.py dashboard
```

## Option 3: REST API

```bash
# Start API
uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000

# Submit batch job
curl -X POST http://localhost:8000/batch \
  -F "folder_path=/path/to/flight_mission/" \
  -F "park_id=PARK_01"

# Check job status
curl http://localhost:8000/status/BATCH-PARK_01-20260411-143022

# Download PDF report
curl http://localhost:8000/report/BATCH-PARK_01-20260411-143022?format=pdf -o report.pdf
```

## Output Files

All outputs go to `output/{batch_id}/`:
- `inspection_report.pdf` — executive report for clients
- `inspection_report.xlsx` — 4-sheet workbook (Summary/Detections/Priority/GPS)
- `park_anomaly_map.geojson` — GPS-tagged anomalies for QGIS / Google Earth
- `annotated/` — annotated thermal and RGB images

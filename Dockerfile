FROM python:3.11-slim AS runtime

# PYTHONSAFEPATH=1 stops Python from putting cwd on sys.path, so the repo's
# `platform/` package can't shadow the stdlib `platform` module (which would
# crash SQLAlchemy/uvicorn). Combined with running uvicorn from /tmp below.
ENV PYTHONUNBUFFERED=1 \
    PYTHONSAFEPATH=1 \
    PORT=8000
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libgomp1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements_platform.txt ml/requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements_platform.txt -r ml/requirements.txt

COPY . .
RUN pip install --no-cache-dir -e .

# Listen on $PORT (Cloud Run sets 8080; HF Spaces uses app_port; default 8000).
# Run from /tmp so the repo's platform/ dir is never on sys.path (shadow fix).
EXPOSE 8000
CMD ["sh", "-c", "cd /tmp && exec python -m uvicorn axalon.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]

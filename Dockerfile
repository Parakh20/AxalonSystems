FROM python:3.11-slim

# System libs for WeasyPrint (PDF) and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libglib2.0-0 \
    libgomp1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY ml/requirements.txt ./ml/requirements.txt
COPY requirements_platform.txt ./requirements_platform.txt
RUN pip install --no-cache-dir -r ml/requirements.txt \
    && pip install --no-cache-dir -r requirements_platform.txt

# Copy source (model weights mounted as volume — not baked in)
COPY . .
RUN pip install --no-cache-dir -e .

EXPOSE 8000 8501

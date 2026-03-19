# Learnify Video Worker — RunPod Serverless
# CUDA base image để support SadTalker GPU (Tier 1)
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ──────────────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright + Chromium browser
RUN pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps chromium

# ── Copy worker code ─────────────────────────────────────────────────────────
COPY . .

# ── SadTalker (clone nếu cần — models sẽ load từ Network Volume) ────────────
# Models KHÔNG đưa vào image (quá lớn) — mount từ RunPod Network Volume
# Network Volume mount path: /workspace/models/sadtalker
ENV SADTALKER_MODEL_PATH=/workspace/models/sadtalker

# ── Environment defaults ─────────────────────────────────────────────────────
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# ── RunPod Serverless entry point ────────────────────────────────────────────
CMD ["python", "-u", "handler.py"]

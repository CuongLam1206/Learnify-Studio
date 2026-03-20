# Learnify Video Worker — RunPod Serverless
# Build context: E:\Learnify_Studio\services\
# Command: docker build -f video-worker/Dockerfile -t cuongld1206/learnify-worker:latest .
FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# ── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    ffmpeg \
    wget \
    curl \
    git \
    ca-certificates \
    libssl-dev \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Tier 2 Worker (slide+voice) ──────────────────────────────────────────────
WORKDIR /app/worker
COPY video-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright + Chromium
RUN pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps chromium

COPY video-worker/ .

# ── SadTalker Server (Tier 1 GPU avatar) ─────────────────────────────────────
WORKDIR /app/sadtalker
COPY sadtalker/requirements.txt .

# Install SadTalker deps (torch đã có trong base image)
RUN pip install --no-cache-dir \
    pydub librosa resampy imageio imageio-ffmpeg \
    opencv-python face_alignment kornia scikit-image \
    safetensors yacs basicsr facexlib gfpgan \
    scipy numba && \
    pip install "numpy==1.26.4" --force-reinstall

COPY sadtalker/ .

# ── Entrypoint ───────────────────────────────────────────────────────────────
WORKDIR /app
COPY video-worker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# SadTalker models mount từ RunPod Network Volume
ENV SADTALKER_MODEL_PATH=/workspace/models/sadtalker
ENV SADTALKER_URL=http://localhost:8100
ENV PYTHONUNBUFFERED=1

CMD ["/entrypoint.sh"]

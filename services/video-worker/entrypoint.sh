#!/bin/bash
set -e

echo "=== Learnify Worker Entrypoint ==="

# ── Link SadTalker checkpoints từ RunPod Network Volume ──────────────────────
SADTALKER_CKPT_SRC="${SADTALKER_MODEL_PATH:-/workspace/models/sadtalker}"
SADTALKER_CKPT_DST="/app/sadtalker/repo/checkpoints"
GFPGAN_WEIGHTS_SRC="${SADTALKER_MODEL_PATH:-/workspace/models/sadtalker}/gfpgan/weights"
GFPGAN_WEIGHTS_DST="/app/sadtalker/repo/gfpgan/weights"

# Auto-download SadTalker checkpoints nếu chưa có trong Network Volume
if [ ! -f "$SADTALKER_CKPT_SRC/SadTalker_V0.0.2_256.safetensors" ]; then
    echo "[Entrypoint] 📥 Downloading SadTalker checkpoints to $SADTALKER_CKPT_SRC ..."
    mkdir -p "$SADTALKER_CKPT_SRC"
    mkdir -p "$GFPGAN_WEIGHTS_SRC"

    pip install -q huggingface_hub

    python3 -c "
from huggingface_hub import snapshot_download
import os, shutil
print('Downloading SadTalker checkpoints...')
local = snapshot_download(
    repo_id='vinthony/SadTalker',
    local_dir='/tmp/sadtalker_dl',
    ignore_patterns=['*.md','*.txt'],
)
ckpt_dst = '$SADTALKER_CKPT_SRC'
for f in os.listdir(local):
    src = os.path.join(local, f)
    dst = os.path.join(ckpt_dst, f)
    if not os.path.exists(dst):
        shutil.move(src, dst)
print('SadTalker checkpoints ready!')
"

    # GFPGAN weights
    echo "[Entrypoint] 📥 Downloading GFPGAN weights..."
    wget -q -nc -O "$GFPGAN_WEIGHTS_SRC/GFPGANv1.4.pth" \
        "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth" || true
    wget -q -nc -O "$GFPGAN_WEIGHTS_SRC/detection_Resnet50_Final.pth" \
        "https://download.openmmlab.com/mmdetection/v2.0/retinaface/retinaface_r50_v1_3x/retinaface_r50_v1_3x_20210306-f5da5048.pth" || true

    echo "[Entrypoint] ✅ SadTalker checkpoints download complete!"
else
    echo "[Entrypoint] ✅ SadTalker checkpoints found in cache, skipping download."
fi

# Link checkpoints vào app directory
if [ -d "$SADTALKER_CKPT_SRC" ]; then
    echo "[Entrypoint] Linking SadTalker checkpoints: $SADTALKER_CKPT_SRC → $SADTALKER_CKPT_DST"
    rm -rf "$SADTALKER_CKPT_DST"
    ln -sf "$SADTALKER_CKPT_SRC" "$SADTALKER_CKPT_DST"
    if [ -d "$GFPGAN_WEIGHTS_SRC" ]; then
        mkdir -p "/app/sadtalker/repo/gfpgan"
        rm -rf "$GFPGAN_WEIGHTS_DST"
        ln -sf "$GFPGAN_WEIGHTS_SRC" "$GFPGAN_WEIGHTS_DST"
    fi
fi


# ── Start SadTalker server (Tier 1 GPU) ──────────────────────────────────────
if [ -f "/app/sadtalker/sadtalker_server.py" ]; then
    echo "[Entrypoint] Starting SadTalker server at port 8100..."
    cd /app/sadtalker
    python sadtalker_server.py --port 8100 &
    SADTALKER_PID=$!
    echo "[Entrypoint] SadTalker PID: $SADTALKER_PID"

    # Đợi SadTalker server lên (tối đa 60 giây)
    echo "[Entrypoint] Waiting for SadTalker to initialize..."
    for i in $(seq 1 12); do
        sleep 5
        if curl -sf http://localhost:8100/health > /dev/null 2>&1; then
            echo "[Entrypoint] ✅ SadTalker ready!"
            break
        fi
        echo "[Entrypoint] Waiting... ($((i*5))s)"
    done
fi

# ── Start RunPod Handler (Tier 2 + dispatch) ─────────────────────────────────
echo "[Entrypoint] Starting RunPod handler..."
cd /app/worker
exec python -u handler.py

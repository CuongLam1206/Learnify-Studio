"""
Cloudflare R2 upload helper — qua Cloudflare Worker proxy.

Docker image RunPod KHÔNG THỂ kết nối TLS tới r2.cloudflarestorage.com.
Giải pháp: deploy Cloudflare Worker làm proxy upload.
Worker dùng R2 binding (không qua S3 API) và URL workers.dev (Cloudflare CDN).
"""

import os
import httpx
from pathlib import Path


def upload_to_r2(local_path: Path, key: str) -> str:
    """Upload file lên R2 qua Cloudflare Worker proxy. Returns: public URL."""
    worker_url = os.getenv("R2_WORKER_URL", "")
    upload_secret = os.getenv("R2_UPLOAD_SECRET", "")
    public_url_base = os.getenv("R2_PUBLIC_URL", "")

    if not worker_url:
        raise Exception(
            "Missing R2_WORKER_URL! "
            "Deploy Cloudflare Worker and set R2_WORKER_URL=https://your-worker.workers.dev"
        )

    content_type = "video/mp4"
    if key.endswith(".vtt"):
        content_type = "text/vtt"
    elif key.endswith(".png") or key.endswith(".jpg"):
        content_type = "image/jpeg"

    file_data = Path(local_path).read_bytes()
    file_size_mb = len(file_data) / (1024 * 1024)
    print(f"  [R2] Uploading {local_path} ({file_size_mb:.1f}MB) → {key}")

    # Upload qua Worker proxy (workers.dev = Cloudflare CDN = accessible)
    url = f"{worker_url.rstrip('/')}/{key}"
    print(f"  [R2] PUT {url}")

    headers = {
        "Content-Type": content_type,
    }
    if upload_secret:
        headers["X-Upload-Key"] = upload_secret

    response = httpx.put(
        url,
        content=file_data,
        headers=headers,
        timeout=300,
    )

    print(f"  [R2] Response: {response.status_code}")

    if response.status_code not in (200, 201):
        print(f"  [R2] Error: {response.text[:300]}")
        raise Exception(f"R2 upload failed HTTP {response.status_code}: {response.text[:200]}")

    print(f"  [R2] ✅ Upload thành công!")

    if public_url_base:
        return f"{public_url_base.rstrip('/')}/{key}"

    # Fallback: return worker URL
    return url


def upload_video_and_subtitle(job_id: str, video_path: Path, vtt_path: Path | None = None):
    """Upload video MP4 + VTT subtitle lên R2 qua Worker proxy."""
    video_key = f"videos/{job_id}.mp4"
    video_url = upload_to_r2(video_path, video_key)
    print(f"  ✅ R2 upload video: {video_url}")

    vtt_url = None
    if vtt_path and vtt_path.exists():
        vtt_key = f"videos/{job_id}.vtt"
        vtt_url = upload_to_r2(vtt_path, vtt_key)
        print(f"  ✅ R2 upload subtitle: {vtt_url}")

    return video_url, vtt_url

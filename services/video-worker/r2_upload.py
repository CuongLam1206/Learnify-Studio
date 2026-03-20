"""
Cloudflare R2 upload helper (S3-compatible API).
Requires: pip install boto3
"""

import os
import boto3
import urllib3
from pathlib import Path
from botocore.config import Config

# ── Tắt warning SSL khi dùng verify=False ──────────────────────────────────────
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def get_r2_client():
    """Tạo boto3 client cho Cloudflare R2 (SSL disabled để tránh handshake failure)."""
    account_id = os.getenv("R2_ACCOUNT_ID", "")
    access_key  = os.getenv("R2_ACCESS_KEY_ID", "")
    secret_key  = os.getenv("R2_SECRET_ACCESS_KEY", "")

    if not account_id or not access_key or not secret_key:
        print("  ⚠️ R2 credentials missing! Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
        return None

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            s3={'addressing_style': 'path'},
            retries={'max_attempts': 3, 'mode': 'standard'}
        ),
        region_name="auto",
        verify=False,  # ← Fix SSL handshake failure với R2
    )


def upload_to_r2(local_path: Path, key: str) -> str:
    """
    Upload file lên R2.
    Returns: Public URL của file trên R2, hoặc raise Exception nếu thất bại.
    """
    bucket = os.getenv("R2_BUCKET_NAME", "learnify-videos")
    public_url_base = os.getenv("R2_PUBLIC_URL", "")

    client = get_r2_client()
    if client is None:
        raise Exception("R2 client could not be created — missing credentials")

    content_type = "video/mp4"
    if key.endswith(".vtt"):
        content_type = "text/vtt"
    elif key.endswith(".png") or key.endswith(".jpg"):
        content_type = "image/jpeg"

    client.upload_file(
        str(local_path),
        bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000",
        },
    )

    if public_url_base:
        return f"{public_url_base.rstrip('/')}/{key}"

    # Fallback: presigned URL (nếu chưa set public domain)
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=86400 * 7,
    )
    return url


def upload_video_and_subtitle(job_id: str, video_path: Path, vtt_path: Path | None = None):
    """
    Upload video MP4 + VTT subtitle lên R2.
    Returns: (video_url, vtt_url_or_None)
    """
    video_key = f"videos/{job_id}.mp4"
    video_url = upload_to_r2(video_path, video_key)
    print(f"  ✅ R2 upload video: {video_url}")

    vtt_url = None
    if vtt_path and vtt_path.exists():
        vtt_key = f"videos/{job_id}.vtt"
        vtt_url = upload_to_r2(vtt_path, vtt_key)
        print(f"  ✅ R2 upload subtitle: {vtt_url}")

    return video_url, vtt_url

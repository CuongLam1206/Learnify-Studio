"""
Cloudflare R2 upload helper (S3-compatible API).
Requires: pip install boto3
"""

import os
import boto3
from pathlib import Path
from botocore.config import Config


def get_r2_client():
    """Tạo boto3 client cho Cloudflare R2."""
    account_id = os.getenv("R2_ACCOUNT_ID", "")
    access_key  = os.getenv("R2_ACCESS_KEY_ID", "")
    secret_key  = os.getenv("R2_SECRET_ACCESS_KEY", "")

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            s3={'addressing_style': 'path'}
        ),
        region_name="auto",
    )


def upload_to_r2(local_path: Path, key: str) -> str:
    """
    Upload file lên R2.
    Args:
        local_path: đường dẫn file local
        key: tên file trên R2 (e.g. "videos/abc123.mp4")
    Returns:
        Public URL của file trên R2
    """
    bucket = os.getenv("R2_BUCKET_NAME", "learnify-videos")
    public_url_base = os.getenv("R2_PUBLIC_URL", "")  # e.g. https://pub-xxx.r2.dev

    try:
        client = get_r2_client()
        
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
    except Exception as e:
        print(f"  ⚠️ R2 upload first attempt failed: {e}")
        if "SSL" in str(e):
            print("  🔄 Retrying R2 upload with verify=False (SSL debug)...")
            account_id = os.getenv("R2_ACCOUNT_ID", "")
            access_key  = os.getenv("R2_ACCESS_KEY_ID", "")
            secret_key  = os.getenv("R2_SECRET_ACCESS_KEY", "")
            
            # Fallback client (verify=False)
            debug_client = boto3.client(
                "s3",
                endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                config=Config(
                    signature_version="s3v4",
                    s3={'addressing_style': 'path'}
                ),
                region_name="auto",
                verify=False
            )
            debug_client.upload_file(
                str(local_path),
                bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "CacheControl": "public, max-age=31536000",
                },
            )
        else:
            raise e

    if public_url_base:
        return f"{public_url_base.rstrip('/')}/{key}"
    
    # Fallback: presigned URL (nếu chưa set public domain)
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=86400 * 7,  # 7 ngày
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

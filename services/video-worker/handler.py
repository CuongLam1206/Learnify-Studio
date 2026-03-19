"""
RunPod Serverless Handler — Learnify Video Worker
Xử lý cả Tier 1 (SadTalker) và Tier 2 (Slide+Voice) trên 1 GPU endpoint.

Input format:
{
    "input": {
        "job_id": "abc123",
        "tier": 2,
        "script": {...},
        "instructor": {"photo_base64": "...", "voice_ref_url": "..."},
        "duration_minutes": 5,
        "voice_id": "vi-VN-HoaiMyNeural",
        "slide_theme": "dark",
        "image_engine": "gemini",
        "avatar_intro": "",
        "subtitle": true
    }
}
"""

import runpod
import sys
import os
from pathlib import Path

# Thêm thư mục hiện tại vào path để import từ main.py
sys.path.insert(0, str(Path(__file__).parent))

# Load .env
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

# Import các pipeline functions từ main.py (reuse toàn bộ logic)
# Chú ý: main.py không được expose FastAPI app ở đây
import asyncio
import traceback
import httpx

from r2_upload import upload_video_and_subtitle

# ── Import pipeline functions từ main.py ─────────────────────────────────────
# Chúng ta import trực tiếp các hàm cần thiết
from main import (
    ProcessRequest,
    run_tier2_pipeline,
    run_sadtalker_pipeline,
    update_job,
    NEXT_API,
)


async def process_video(event_input: dict) -> dict:
    """
    Wrapper async để chạy pipeline và upload R2.
    """
    job_id = event_input.get("job_id")
    tier   = event_input.get("tier", 2)

    try:
        req = ProcessRequest(
            job_id          = job_id,
            tier            = tier,
            script          = event_input.get("script"),
            instructor      = event_input.get("instructor"),
            duration_minutes= event_input.get("duration_minutes", 5),
            voice_id        = event_input.get("voice_id", "vi-VN-HoaiMyNeural"),
            slide_theme     = event_input.get("slide_theme", "dark"),
            image_engine    = event_input.get("image_engine", "gemini"),
            avatar_intro    = event_input.get("avatar_intro", ""),
            subtitle        = event_input.get("subtitle", True),
        )

        # Chạy pipeline (pipeline tự upload R2 sau khi xong)
        if tier == 1:
            await run_sadtalker_pipeline(req)
        else:
            await run_tier2_pipeline(req)

        # Lấy outputUrl từ DB để trả về
        next_api = os.getenv("NEXT_PUBLIC_APP_URL", "https://learnify-studio.vercel.app")
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{next_api}/api/video/jobs/{job_id}", timeout=10)
            if resp.status_code == 200:
                job_data = resp.json().get("job", {})
                return {
                    "job_id"   : job_id,
                    "status"   : job_data.get("status", "done"),
                    "outputUrl": job_data.get("outputUrl", ""),
                }

        return {"job_id": job_id, "status": "done"}

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[handler] ❌ Error in job {job_id}:\n{tb}")
        await update_job(job_id, {"status": "failed", "errorMessage": str(e)[:500]})
        return {"job_id": job_id, "status": "failed", "error": str(e)[:200]}


def handler(event):
    """
    RunPod Serverless entry point.
    RunPod gọi hàm này với mỗi job.
    """
    input_data = event.get("input", {})
    job_id = input_data.get("job_id", "unknown")
    print(f"[RunPod] Received job: {job_id} | tier={input_data.get('tier', 2)}")

    # RunPod handler là sync, nhưng pipeline là async → dùng asyncio.run
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    result = asyncio.run(process_video(input_data))
    print(f"[RunPod] Job {job_id} complete: {result.get('status')}")
    return result


# ── RunPod Serverless start ───────────────────────────────────────────────────
if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})

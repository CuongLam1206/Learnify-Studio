"""
Learnify Video Worker — Tier 2 Real Pipeline
Slide render (Playwright) + TTS (edge-tts) + Merge (FFmpeg)
"""

import asyncio
import base64
import concurrent.futures
import os
import json
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

# FFmpeg full build (có libass cho subtitle filter)
_FFMPEG_FULL = Path(r"C:\Users\admin\Downloads\ffmpeg-8.0.1-full_build\ffmpeg-8.0.1-full_build\bin\ffmpeg.exe")
FFMPEG = str(_FFMPEG_FULL) if _FFMPEG_FULL.exists() else "ffmpeg"

from dotenv import load_dotenv

# Load .env file từ thư mục services/video-worker/
load_dotenv(Path(__file__).parent / ".env")

import edge_tts  # fallback nếu gtts lỗi
from gtts import gTTS
import httpx
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from playwright.sync_api import sync_playwright
from pydantic import BaseModel

# Windows: dùng ProactorEventLoop để cho phép subprocess trong asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

app = FastAPI(title="Learnify Video Worker", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NEXT_API = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY", "")
HEYGEN_API = "https://api.heygen.com"
HEYGEN_DEFAULT_AVATAR = os.getenv("HEYGEN_DEFAULT_AVATAR", "Angela-inblackskirt-20220820")
PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")

VOICE_VI = "vi-VN-NamMinhNeural"
VOICE_VI_F = "vi-VN-HoaiMyNeural"


# Danh sách voice hỗ trợ
VOICES = {
    # ── Edge TTS — Microsoft (miễn phí, cần mạng không bị chặn) ─────────────
    "vi-VN-HoaiMyNeural":  {"name": "Hoài My (Nữ)",      "engine": "edge",       "edgeName": "vi-VN-HoaiMyNeural"},
    "vi-VN-NamMinhNeural": {"name": "Nam Minh (Nam)",     "engine": "edge",       "edgeName": "vi-VN-NamMinhNeural"},
    # ── ElevenLabs — giọng tiếng Việt (Voice Library)
    "el-vi-1": {"name": "Thảo — Dịu dàng",   "engine": "elevenlabs", "elId": "558B1EcdabtcSdleer40"},
    "el-vi-2": {"name": "Ninh Đôn — Trầm ấm", "engine": "elevenlabs", "elId": "aN7cv9yXNrfIR87bDmyD"},
    "el-vi-3": {"name": "Hiện — Phạt thanh",   "engine": "elevenlabs", "elId": "jdlxsPOZOHdGEfcItXVu"},
    "el-vi-4": {"name": "Thắm — Miền Bắc",   "engine": "elevenlabs", "elId": "0ggMuQ1r9f9jqBu50nJn"},
    "el-vi-5": {"name": "Nhật — Thuyết phục", "engine": "elevenlabs", "elId": "6adFm46eyy74snVn6YrT"},
    # ── Google TTS — fallback miễn phí ──────────────────────────────────────
    "gtts-vi":     {"name": "Google TTS (Nữ)",      "engine": "gtts",       "edgeName": None},
}

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_MODEL   = "eleven_multilingual_v2"

# Danh sách slide themes
SLIDE_THEMES = {
    "dark":     {"bg": "linear-gradient(135deg, #0f1117 0%, #1a1f2e 50%, #0f1117 100%)",   "accent": "#6366f1", "accent2": "#8b5cf6", "text": "#e2e8f0",  "h1start": "#ffffff", "h1end": "#a5b4fc", "bar": "#1e2337"},
    "ocean":    {"bg": "linear-gradient(135deg, #0d1b2a 0%, #1a3a4a 50%, #0d1b2a 100%)",   "accent": "#06b6d4", "accent2": "#0891b2", "text": "#e0f2fe",  "h1start": "#ffffff", "h1end": "#67e8f9", "bar": "#0f2537"},
    "midnight": {"bg": "linear-gradient(135deg, #0a0a0f 0%, #141420 50%, #0a0a0f 100%)",   "accent": "#7c3aed", "accent2": "#6d28d9", "text": "#ede9fe",  "h1start": "#ffffff", "h1end": "#c4b5fd", "bar": "#1a1730"},
    "forest":   {"bg": "linear-gradient(135deg, #0a1f0a 0%, #162716 50%, #0a1f0a 100%)",   "accent": "#10b981", "accent2": "#059669", "text": "#d1fae5",  "h1start": "#ffffff", "h1end": "#6ee7b7", "bar": "#102210"},
    "sunset":   {"bg": "linear-gradient(135deg, #1a0a0f 0%, #2d1520 50%, #1a0a0f 100%)",   "accent": "#f97316", "accent2": "#ea580c", "text": "#fed7aa",  "h1start": "#ffffff", "h1end": "#fdba74", "bar": "#2a1008"},
    "light":    {"bg": "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)",    "accent": "#4f46e5", "accent2": "#7c3aed", "text": "#1e293b",  "h1start": "#0f172a", "h1end": "#4338ca", "bar": "#e2e8f0"},
}


class ProcessRequest(BaseModel):
    job_id: str
    tier: int = 2
    script: Any
    instructor: Any = None
    duration_minutes: int = 15
    voice_id: str = "vi-VN-HoaiMyNeural"
    slide_theme: str = "dark"
    image_engine: str = "gemini"  # "gemini" | "stable-diffusion"
    avatar_intro: str = ""  # custom intro text cho SadTalker avatar (Tier 1)
    subtitle: bool = True       # burn subtitle vào video


@app.get("/")
def root():
    return {"status": "ok", "version": "0.2.0"}


@app.get("/health")
def health():
    ffmpeg_ok = shutil.which("ffmpeg") is not None
    chromium_ok = True  # playwright sẽ báo lỗi khi dùng nếu chưa install
    return {
        "status": "ok",
        "ffmpeg": ffmpeg_ok,
        "chromium": chromium_ok,
        "voice": VOICE_VI,
    }


@app.post("/process")
async def process(req: ProcessRequest, background_tasks: BackgroundTasks):
    """Nhận job từ Next.js, chạy pipeline trong background."""
    background_tasks.add_task(run_pipeline, req)
    return {"accepted": True, "job_id": req.job_id}


async def update_job(job_id: str, data: dict):
    """Gọi Next.js API để update job status/progress."""
    async with httpx.AsyncClient() as client:
        try:
            await client.patch(
                f"{NEXT_API}/api/video/jobs/{job_id}",
                json=data,
                timeout=10,
            )
        except Exception as e:
            print(f"[update_job] Error: {e}")


async def run_pipeline(req: ProcessRequest):
    """Router: chọn đúng pipeline theo tier."""
    if req.tier == 1:
        await run_sadtalker_pipeline(req)
    else:
        await run_tier2_pipeline(req)


SADTALKER_URL = os.getenv("SADTALKER_URL", "http://localhost:8100")


async def _call_sadtalker_preprocess(photo_b64: str, preprocess: str = "crop", size: int = 256) -> str | None:
    """Gọi SadTalker /preprocess để cache face trước. Trả về cache_key hoặc None."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            res = await client.post(
                f"{SADTALKER_URL}/preprocess",
                json={"photo_base64": photo_b64, "preprocess": preprocess, "size": size},
            )
        data = res.json()
        if data.get("success"):
            print(f"  SadTalker preprocess OK — cache_key={data.get('cache_key')} ({data.get('elapsed')}s)")
            return data.get("cache_key")
        else:
            print(f"  SadTalker preprocess failed: {data.get('error')}")
    except Exception as e:
        print(f"  SadTalker preprocess error (non-fatal): {e}")
    return None


async def run_sadtalker_pipeline(req: ProcessRequest):
    """Tier 1: TTS → SadTalker talking head → ghep slide."""
    job_id = req.job_id
    script = req.script
    instructor = req.instructor or {}

    if not script or not script.get("sections"):
        await update_job(job_id, {"status": "failed", "errorMessage": "Script rỗng"})
        return

    # Lấy ảnh GV từ instructor
    photo_b64 = instructor.get("photo_base64", "")
    if not photo_b64:
        await update_job(job_id, {"status": "failed",
                                   "errorMessage": "Chưa có ảnh giảng viên (Tier 1 cần upload ảnh)"})
        return

    sections = script["sections"]
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"learnify_t1_{job_id}_"))

    try:
        print(f"[{job_id}] Tier 1 SadTalker pipeline — {len(sections)} sections")
        voice_id = req.voice_id or "vi-VN-HoaiMyNeural"

        # ── Bước 1: TTS + Face Preprocess SONG SONG ────────────────────────────
        # Hai tác vụ nặng nhất chạy đồng thời để tiết kiệm thời gian
        await update_job(job_id, {"progress": 5,
                                   "progressMessage": "🎤 TTS + 👤 Face preprocess (song song)..."})
        print(f"[{job_id}] ⚡ TTS + SadTalker /preprocess chạy đồng thời")

        tts_task       = asyncio.create_task(generate_tts(sections, tmp_dir, voice_id))
        preproc_task   = asyncio.create_task(
            _call_sadtalker_preprocess(photo_b64, preprocess="crop", size=256)
        )
        audio_paths, face_cache_key = await asyncio.gather(tts_task, preproc_task)
        print(f"[{job_id}] TTS + preprocess done — face_cache_key={face_cache_key}")

        # ── Ghép FULL audio cho slides ─────────────────────────────────────
        await update_job(job_id, {"progress": 25,
                                   "progressMessage": "🔊 Ghép audio..."})
        concat_list = tmp_dir / "concat.txt"
        merged_wav  = tmp_dir / "merged.wav"
        with open(concat_list, "w") as f:
            for ap in audio_paths:
                f.write(f"file '{ap}'\n")
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(concat_list), "-ar", "16000", "-ac", "1",
            str(merged_wav)
        ], check=True, capture_output=True)

        # ── Tạo INTRO audio riêng cho SadTalker avatar ─────────────────────
        # Avatar nói toàn bộ narration của slide 1 (không giới hạn ký tự).
        # Sau khi intro kết thúc, avatar biến mất – slides tiếp tục với full narration.
        # Dùng custom intro text từ UI nếu user đã nhập, fallback về section[0]
        if req.avatar_intro.strip():
            first_narration = req.avatar_intro.strip()
            print(f"[{job_id}] Avatar intro: custom text ({len(first_narration)} chars)")
        else:
            first_narration = (
                sections[0].get("narration", "")
                or sections[0].get("voiceOver", "")
                or ""
            )
            print(f"[{job_id}] Avatar intro: auto from section[0] ({len(first_narration)} chars)")

        intro_wav = tmp_dir / "intro.wav"
        voice_cfg = VOICES.get(voice_id, VOICES["vi-VN-HoaiMyNeural"])
        engine    = voice_cfg["engine"]
        edge_name = voice_cfg.get("edgeName") or voice_id

        if first_narration:
            intro_mp3 = tmp_dir / "intro.mp3"
            try:
                if engine == "edge":
                    communicate = edge_tts.Communicate(first_narration, edge_name)
                    await communicate.save(str(intro_mp3))
                else:
                    loop_ref = asyncio.get_event_loop()
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        await loop_ref.run_in_executor(pool, _gtts_save, first_narration, str(intro_mp3))
            except Exception as _tts_err:
                print(f"[{job_id}] Intro TTS lỗi: {_tts_err} — dùng full audio")
                intro_mp3 = audio_paths[0]  # fallback

            # Convert intro mp3 → wav 16kHz mono
            subprocess.run([
                "ffmpeg", "-y", "-i", str(intro_mp3),
                "-ar", "16000", "-ac", "1", str(intro_wav)
            ], check=True, capture_output=True)
            audio_b64 = base64.b64encode(intro_wav.read_bytes()).decode()
            print(f"[{job_id}] Avatar intro: {len(first_narration)} ký tự (~" +
                  f"{len(first_narration)//15}s) thay vì full {len(sections)} sections")
        else:
            # Fallback: dùng full audio nếu không có narration
            audio_b64 = base64.b64encode(merged_wav.read_bytes()).decode()


        # ── Bước 2: SadTalker + Slide Render SONG SONG ────────────────────────
        # Slide render không phụ thuộc SadTalker → chạy đồng thời
        await update_job(job_id, {"progress": 30,
                                   "progressMessage": "👤 SadTalker + 🎨 Slides (song song)..."})
        print(f"[{job_id}] ⚡ SadTalker generate + slide render chạy đồng thời")

        async def _sadtalker_generate():
            """Gọi SadTalker /generate với face_cache_key nếu có."""
            async with httpx.AsyncClient(timeout=3600) as client:
                res = await client.post(
                    f"{SADTALKER_URL}/generate",
                    json={
                        "photo_base64":  photo_b64,
                        "audio_base64":  audio_b64,
                        "still":         True,
                        "preprocess":    "crop",
                        "size":          256,
                        "face_cache_key": face_cache_key,  # dùng cache → bỏ qua face preprocess
                    }
                )
            return res.json()

        loop = asyncio.get_event_loop()
        # run_in_executor trả về Future (không phải coroutine)
        # asyncio.gather() chấp nhận cả coroutine lẫn Future — không cần create_task
        slides_future   = loop.run_in_executor(
            None, render_slides_sync, sections, tmp_dir, req.slide_theme, req.image_engine, 1
        )
        sadtalker_task  = asyncio.create_task(_sadtalker_generate())

        st_data, slide_paths = await asyncio.gather(sadtalker_task, slides_future)

        if not st_data.get("success"):
            raise RuntimeError(f"SadTalker lỗi: {st_data.get('error', 'unknown')}")

        talking_video = tmp_dir / "talking.mp4"
        talking_video.write_bytes(base64.b64decode(st_data["video_base64"]))
        elapsed_st = st_data.get("elapsed", "?")
        print(f"[{job_id}] SadTalker done in {elapsed_st}s — {talking_video.stat().st_size//1024}KB")

        # ── Bước 3: Composite talking head + slide ────────────────────────────
        await update_job(job_id, {"progress": 85,
                                   "progressMessage": "🎥 Merging video..."})
        # Generate subtitle nếu bật
        srt_path = None
        if req.subtitle:
            srt_path = tmp_dir / "subtitles.srt"
            generate_srt(sections, audio_paths, srt_path)
            print(f"[{job_id}] 📝 Subtitle generated: {srt_path}")

        output_mp4 = tmp_dir / "final.mp4"
        await _composite_talking_slide(talking_video, slide_paths, audio_paths, output_mp4, srt_path=srt_path)

        # ── Bước 4: Upload ────────────────────────────────────────────────────
        public_dir = Path(__file__).parent.parent.parent / "public" / "videos"
        public_dir.mkdir(parents=True, exist_ok=True)
        dest = public_dir / f"{job_id}.mp4"
        shutil.copy2(output_mp4, dest)
        # Copy VTT soft subtitle cho player toggle
        if srt_path and srt_path.exists():
            vtt_path = srt_path.with_suffix(".vtt")
            srt_to_vtt(srt_path, vtt_path)
            shutil.copy2(vtt_path, public_dir / f"{job_id}.vtt")
        output_url = f"{NEXT_API}/videos/{job_id}.mp4"

        await update_job(job_id, {
            "status": "done",
            "progress": 100,
            "outputUrl": output_url,
            "fileSizeMb": round(dest.stat().st_size / 1_000_000, 2),
            "costUsd": 0.0,
        })
        print(f"[{job_id}] ✅ Tier 1 Done — {output_url}")

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[{job_id}] ❌ Tier 1 error:\n{tb}")
        await update_job(job_id, {"status": "failed", "errorMessage": str(e)[:500]})
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


async def _composite_talking_slide(
    talking_path: Path,
    slide_paths: list,
    audio_paths: list,
    output: Path,
    srt_path: Path = None,
):
    """Ghép talking head + slides bằng FFmpeg Picture-in-Picture.
    Avatar được crop thành hình tròn (circular PiP) với viền trắng để
    tránh nền avatar lệch màu slide và không che nội dung góc phải.
    """
    import tempfile as _tf
    tmp = Path(_tf.mkdtemp())
    try:
        # Ghép slide thành slideshow (giống tier2)
        slide_video = tmp / "slides.mp4"
        await merge_video(slide_paths, audio_paths, slide_video)

        # ── Circular PiP overlay ──────────────────────────────────────────────
        # Chiến lược:
        #   1. Scale talking head về 240x240
        #   2. Pad thêm 6px trắng mỗi bên → 252x252 (tạo viền trắng)
        #   3. Chuyển sang yuva420p (có alpha channel)
        #   4. Dùng geq để vẽ alpha mask hình tròn → xoá góc vuông + nền lạ
        #   5. Overlay góc dưới TRÁI (tránh che image/content góc phải của slide)
        #   6. eof_action=pass: avatar biến mất sau intro, slide tiếp tục

        FACE_SIZE  = 200  # diameter (px)
        RADIUS     = FACE_SIZE // 2   # 100

        filter_complex = (
            f"[1:v]scale={FACE_SIZE}:{FACE_SIZE},"
            f"format=yuva420p,"
            f"geq=lum='p(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':"
            f"a='if(lte(hypot(X-{RADIUS},Y-{RADIUS}),{RADIUS-1}),255,0)'[pip];"
        # Slide 1280x720 — RIGHT column: width=400px, starts at x=832
        # Avatar center: x=1032, y=532
        #   x_left = 1032 - RADIUS = 1032-100 = 932
        #   y_top  = 532  - RADIUS = 532-100 = 432
            f"[0:v][pip]overlay=932:432:eof_action=pass"
        )

        # Không burn subtitle vào video — dùng soft subtitle (VTT) trên player
        subprocess.run([
            FFMPEG, "-y",
            "-i", str(slide_video),
            "-i", str(talking_path),
            "-filter_complex", filter_complex,
            "-c:v", "libx264", "-crf", "25", "-preset", "ultrafast",
            "-c:a", "copy",
            str(output)
        ], check=True, capture_output=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)



async def run_tier2_pipeline(req: ProcessRequest):
    """Tier 2/3: Slide render (theme) → TTS (voice) → FFmpeg merge."""
    job_id = req.job_id
    script = req.script
    voice_id = req.voice_id
    slide_theme = req.slide_theme
    image_engine = req.image_engine

    if not script or not script.get("sections"):
        await update_job(job_id, {"status": "failed", "errorMessage": "Script rỗng"})
        return

    sections = script["sections"]
    total = len(sections)
    tmp_dir = Path(tempfile.mkdtemp(prefix=f"learnify_{job_id}_"))

    try:
        print(f"[{job_id}] Starting Tier 2 pipeline — {total} sections | theme={slide_theme} | voice={voice_id}")

        # ── Phase 1: Render slides (25%) ──────────────────────────────────────
        await update_job(job_id, {"progress": 5})
        # sync_playwright chạy trong thread — tránh Windows asyncio subprocess lỗi
        loop = asyncio.get_event_loop()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            slide_paths = await loop.run_in_executor(
                pool, render_slides_sync, sections, tmp_dir, slide_theme, image_engine
            )
        await update_job(job_id, {"progress": 25})


        # ── Phase 2: TTS (50%) ────────────────────────────────────────────────
        audio_paths = await generate_tts(sections, tmp_dir, voice_id)
        await update_job(job_id, {"progress": 55})

        # ── Phase 3: Merge với FFmpeg (90%) ───────────────────────────────────
        # Generate subtitle nếu bật
        srt_path = None
        if req.subtitle:
            srt_path = tmp_dir / "subtitles.srt"
            generate_srt(sections, audio_paths, srt_path)
            print(f"[{job_id}] 📝 Subtitle generated")

        output_path = tmp_dir / "output.mp4"
        await merge_video(slide_paths, audio_paths, output_path, srt_path=srt_path)
        await update_job(job_id, {"progress": 90})

        # ── Phase 4: Upload (copy to public dir for demo) ─────────────────────
        public_dir = Path(__file__).parent.parent.parent / "public" / "videos"
        public_dir.mkdir(parents=True, exist_ok=True)
        dest = public_dir / f"{job_id}.mp4"
        shutil.copy2(output_path, dest)
        # Copy VTT soft subtitle cho player toggle
        if srt_path and srt_path.exists():
            vtt_path = srt_path.with_suffix(".vtt")
            srt_to_vtt(srt_path, vtt_path)
            shutil.copy2(vtt_path, public_dir / f"{job_id}.vtt")

        video_url = f"{NEXT_API}/videos/{job_id}.mp4"
        file_size_mb = round(dest.stat().st_size / 1024 / 1024, 1)

        await update_job(job_id, {
            "status": "done",
            "progress": 100,
            "outputUrl": video_url,
            "fileSizeMb": file_size_mb,
            # Chi phí: Gemini 2.0 Flash Exp (image gen) = miễn phí (experimental)
            # gTTS = miễn phí | FFmpeg = miễn phí | Pexels = miễn phí
            "costUsd": 0.0,
        })
        print(f"[{job_id}] ✅ Done — {video_url}")

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[{job_id}] ❌ Pipeline error:\n{tb}")
        await update_job(job_id, {
            "status": "failed",
            "errorMessage": str(e)[:500],
        })
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def generate_gemini_image_sync(keyword: str) -> str:
    """Tạo ảnh AI từ Gemini. Thử nhiều config, trả về base64 data URL hoặc ''."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or not keyword:
        return ""
    print(f"  Gemini key=...{api_key[-6:]} | '{keyword[:30]}'")

    # English-only prompt — STRICTLY photorealistic, NO cartoon/illustration
    prompt = (
        f"A stunning photorealistic image about: {keyword}. "
        "Shot with a professional DSLR camera, realistic photo style like stock photography. "
        "Cinematic lighting, shallow depth of field, high detail, 8K quality. "
        "STRICTLY FORBIDDEN: cartoon, illustration, flat design, clip art, vector art, "
        "infographic, icon style, anime, comic, drawing, sketch, hand-drawn. "
        "No text, no words, no labels, no watermarks."
    )
    configs = [
        # gemini-2.0-flash-exp + TEXT+IMAGE — đang hoạt động
        ("v1beta", "gemini-2.0-flash-exp",                  ["TEXT", "IMAGE"]),
        # Fallback: image-generation model — nếu future access
        ("v1beta", "gemini-2.0-flash-exp-image-generation", ["TEXT", "IMAGE"]),
    ]
    for api_ver, model, modalities in configs:
        try:
            resp = httpx.post(
                f"https://generativelanguage.googleapis.com/{api_ver}/models/{model}:generateContent",
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {"responseModalities": modalities},
                },
                timeout=40.0,
            )
            if resp.status_code == 200:
                parts = (
                    resp.json()
                    .get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [])
                )
                for part in parts:
                    b64 = part.get("inlineData", {}).get("data", "")
                    mime = part.get("inlineData", {}).get("mimeType", "image/png")
                    if b64:
                        print(f"  Gemini [{api_ver}/{model[:20]}] image OK!")
                        return f"data:{mime};base64,{b64}"
                print(f"  Gemini [{api_ver}/{model[:20]}] 200 but no image")
            else:
                err = resp.json().get("error", {}).get("message", resp.text[:60])
                print(f"  Gemini [{api_ver}/{model[:20]}] {resp.status_code}: {err}")
        except Exception as e:
            print(f"  Gemini [{api_ver}/{model[:20]}] error: {e}")
    return ""



def _pexels_search(client: httpx.Client, query: str) -> str:
    """Gọi Pexels API 1 lần, return image URL hoặc ''."""
    resp = client.get(
        "https://api.pexels.com/v1/search",
        headers={"Authorization": PEXELS_API_KEY},
        params={"query": query, "per_page": 3, "orientation": "landscape"},
    )
    print(f"  Pexels [{resp.status_code}] query='{query[:30]}'")
    if resp.status_code == 200:
        photos = resp.json().get("photos", [])
        if photos:
            return photos[0]["src"]["large"]
    elif resp.status_code not in (500, 503):
        print(f"  Pexels error: {resp.text[:100]}")
    return ""


def generate_sd_image_sync(prompt: str) -> str:
    """Gen ảnh qua Stable Diffusion AUTOMATIC1111 API. Trả về base64 data URL hoặc ''."""
    sd_url = os.getenv("SD_API_URL", "").rstrip("/")
    if not sd_url:
        print("  [SD] SD_API_URL chưa cấu hình — bỏ qua")
        return ""
    sd_model = os.getenv("SD_MODEL", "")
    payload: dict = {
        "prompt": prompt,
        "negative_prompt": "text, watermark, blurry, lowres, nsfw, ugly",
        "width": 768, "height": 432,
        "steps": 20, "cfg_scale": 7,
        "sampler_name": "DPM++ 2M Karras",
        "n_iter": 1, "batch_size": 1,
    }
    if sd_model:
        payload["override_settings"] = {"sd_model_checkpoint": sd_model}
    try:
        resp = httpx.post(f"{sd_url}/sdapi/v1/txt2img", json=payload, timeout=90.0)
        if resp.status_code == 200:
            b64 = resp.json().get("images", [""])[0]
            if b64:
                print("  [SD] image OK!")
                return f"data:image/png;base64,{b64}"
        else:
            print(f"  [SD] {resp.status_code}: {resp.text[:80]}")
    except Exception as e:
        print(f"  [SD] Error: {e}")
    return ""


def fetch_pexels_image_sync(keyword: str) -> str:
    """Fetch ảnh landscape từ Pexels theo keyword. Return URL hoặc empty string."""
    if not PEXELS_API_KEY or not keyword:
        return ""

    vi_en = {
        "python": "python programming", "lập trình": "programming code",
        "giới thiệu": "introduction overview", "tổng quan": "overview aerial",
        "lịch sử": "history culture", "điều kiện": "logic decision",
        "vòng lặp": "loop technology", "hàm": "function programming",
        "dữ liệu": "data technology", "toán": "mathematics",
        "kết luận": "conclusion summary", "tóm tắt": "summary",
        "phát triển": "development growth", "ứng dụng": "application software",
        "mạng": "network internet", "cơ sở": "foundation basics",
        "thuật toán": "algorithm", "web": "web development",
        "danh hiệu": "trophy award champion", "cầu thủ": "football player",
        "thể thao": "sports", "bóng đá": "football soccer stadium",
        "kinh tế": "economy finance", "y tế": "healthcare medical",
        "giáo dục": "education learning", "khoa học": "science technology",
        "thiên nhiên": "nature landscape", "văn hóa": "culture tradition",
        "kiến trúc": "architecture building", "nghệ thuật": "art creative",
        "barcelona": "barcelona city spain", "việt nam": "vietnam landscape",
        "hùng": "legend hero", "huyền thoại": "legend iconic",
    }
    kw_lower = keyword.lower()
    en_query = ""
    for vi, en in vi_en.items():
        if vi in kw_lower:
            en_query = en
            break

    if not en_query:
        # Fallback: lấy 2 từ đầu của keyword (có thể là tiếng Anh)
        words = [w for w in keyword.strip().split() if len(w) > 2]
        en_query = " ".join(words[:2]) if words else "education"

    try:
        with httpx.Client(timeout=7) as client:
            img = _pexels_search(client, en_query)
            if img:
                return img
            # Retry với query đơn giản hơn
            fallback_q = en_query.split()[0]
            img = _pexels_search(client, fallback_q)
            return img
    except Exception as e:
        print(f"  Pexels fetch error: {e}")
    return ""


def _fetch_image_for_section(section: dict) -> str:
    """Fetch ảnh: ưu tiên customImageBase64 → SD/Gemini → Pexels fallback.
    image_engine được đọc từ section['_imageEngine'] (inject trước khi fetch)."""
    # ── Ưu tiên ảnh user upload ───────────────────────────────────────────────
    custom = section.get("customImageBase64", "")
    if custom:
        print(f"  Custom image provided — skipping AI gen")
        return custom

    image_engine = section.get("_imageEngine", "gemini")

    # ── Build enriched keyword ────────────────────────────────────────────────
    base_kw   = section.get("imageKeyword", "").strip()
    title     = section.get("title", "").strip()
    content   = section.get("slideContent", "") or ""

    # Lấy bullet đầu tiên từ slideContent làm context
    first_bullet = ""
    for line in content.replace("|", "\n").split("\n"):
        line = line.strip().lstrip("•").strip()
        if line:
            first_bullet = line
            break

    if base_kw:
        query = f"{base_kw} — {title}" if title and title.lower() not in base_kw.lower() else base_kw
    elif title:
        query = f"{title}: {first_bullet}" if first_bullet else title
    else:
        return ""

    query = query[:120]

    # 1. Stable Diffusion (nếu được chọn)
    if image_engine == "stable-diffusion":
        img = generate_sd_image_sync(query)
        if img:
            return img
        print("  [SD] Failed — fallback to Gemini")

    # 2. Gemini Imagen
    img = generate_gemini_image_sync(query)
    if img:
        return img

    # 3. Pexels fallback
    if PEXELS_API_KEY:
        try:
            timeout_cfg = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=5.0)
            with httpx.Client(timeout=timeout_cfg) as client:
                img = _pexels_search(client, query)
                if not img and " " in query:
                    img = _pexels_search(client, query.split()[0])
                return img or ""
        except Exception as e:
            print(f"  Pexels error ({query[:25]}): {e}")
    return ""


def render_slides_sync(sections: list, tmp_dir: Path, theme: str = "dark", image_engine: str = "gemini", tier: int = 2) -> list[Path]:
    """Render mỗi section thành slide PNG dùng Playwright sync API (Windows-safe)."""
    slide_paths = []

    # ── Inject _imageEngine vào mỗi section để _fetch_image_for_section dùng ──
    enriched = [{**s, "_imageEngine": image_engine} for s in sections]

    # ── Fetch tất cả ảnh song song TRƯỚC khi render ──────────────────────────
    print(f"  Fetching images for {len(sections)} slides (parallel, engine={image_engine})...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(sections), 4)) as pool:
        image_urls = list(pool.map(_fetch_image_for_section, enriched))

    for i, (section, img_url) in enumerate(zip(sections, image_urls)):
        kw = section.get("imageKeyword") or section.get("title", "")
        src = "Gemini" if img_url and img_url.startswith("data:") else "Pexels"
        status = f"[{src}] OK" if img_url else "no image"
        print(f"  Slide {i+1}: '{kw[:30]}' → {status}")

    # ── Render slides với Playwright ──────────────────────────────────────────
    print(f"  Slide theme: {theme}")
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        for i, (section, image_url) in enumerate(zip(sections, image_urls)):
            # Chỉ slide 1 của Tier 1 mới là avatar slide (có vùng trống cho avatar overlay)
            is_avatar_slide = (tier == 1 and i == 0)
            html = build_slide_html(section, i + 1, len(sections), image_url, theme, is_avatar_slide)
            page.set_content(html, wait_until="networkidle")
            time.sleep(0.5)

            png_path = tmp_dir / f"slide_{i:03d}.png"
            page.screenshot(path=str(png_path), full_page=False)
            slide_paths.append(png_path)
            print(f"  Slide {i+1}/{len(sections)} rendered")

        browser.close()

    return slide_paths


def build_slide_html(section: dict, current: int, total: int, image_url: str = "", theme: str = "dark", is_avatar_slide: bool = False) -> str:
    """Tạo HTML đẹp cho mỗi slide — layout 2 cột nếu có ảnh, hỗ trợ 6 themes.
    is_avatar_slide=True: slide 1 Tier 1, giữ vùng trống bên dưới ảnh cho avatar overlay.
    is_avatar_slide=False: layout cân xứng, ảnh căn giữa dọc cùng text.
    """
    t = SLIDE_THEMES.get(theme, SLIDE_THEMES["dark"])
    bg = t["bg"]; acc = t["accent"]; acc2 = t["accent2"]
    txt = t["text"]; h1s = t["h1start"]; h1e = t["h1end"]; bar = t["bar"]
    title = section.get("title", "")
    content = section.get("slideContent", "")

    # Parse bullet points
    bullets = []
    for line in content.replace("|", "\n").split("\n"):
        line = line.strip().lstrip("•").strip()
        if line:
            bullets.append(line)

    max_bullets = 4 if image_url else 6
    bullets_html = "\n".join(
        f'<li style="margin: 10px 0; opacity: 0.9;">{b}</li>' for b in bullets[:max_bullets]
    )

    # Layout: 2 cột nếu có ảnh, 1 cột nếu không
    if image_url and is_avatar_slide:
        # ── AVATAR SLIDE (slide 1 Tier 1) ──────────────────────────────────
        # RIGHT column: ảnh 320px (fixed height) + empty zone bên dưới
        # Empty zone = nơi avatar sẽ được overlay vào bằng FFmpeg
        img_block = f'''
        <div style="
            width: 400px; flex-shrink: 0; align-self: stretch;
            display: flex; flex-direction: column; gap: 8px;
        ">
            <div style="
                height: 320px; border-radius: 16px; overflow: hidden;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                border: 1px solid {acc}33;
                flex-shrink: 0;
            ">
                <img src="{image_url}" style="width:100%; height:320px; object-fit:cover; display:block;"/>
            </div>
            <div style="flex:1;"></div>
        </div>'''
        content_style = "flex:1; display:flex; flex-direction:column; justify-content:center; padding-right:40px; align-self:stretch;"
        body_content = f'''
  <div class="content" style="display:flex; flex-direction:row; align-items:flex-start; gap:0; flex:1; padding:20px 48px 20px;">
    <div style="{content_style}">
      <div class="section-num">Phần {current}</div>
      <h1>{title}</h1>
      <div class="divider"></div>
      <ul>{bullets_html}</ul>
    </div>
    {img_block}
  </div>'''
    elif image_url:
        # ── NORMAL SLIDE (không có avatar) ─────────────────────────────────
        # Layout cân xứng: text trái + ảnh phải căn giữa dọc
        img_block = f'''
        <div style="
            width: 380px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
        ">
            <div style="
                width: 100%; border-radius: 16px; overflow: hidden;
                box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                border: 1px solid {acc}33;
            ">
                <img src="{image_url}" style="width:100%; height:auto; max-height:380px; object-fit:cover; display:block;"/>
            </div>
        </div>'''
        content_style = "flex:1; display:flex; flex-direction:column; justify-content:center; padding-right:40px;"
        body_content = f'''
  <div class="content" style="display:flex; flex-direction:row; align-items:center; gap:24px; flex:1; padding:20px 48px 20px;">
    <div style="{content_style}">
      <div class="section-num">Phần {current}</div>
      <h1>{title}</h1>
      <div class="divider"></div>
      <ul>{bullets_html}</ul>
    </div>
    {img_block}
  </div>'''
    else:
        body_content = f'''
  <div class="content">
    <div class="section-num">Phần {current}</div>
    <h1>{title}</h1>
    <div class="divider"></div>
    <ul>{bullets_html}</ul>
  </div>'''

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: 1280px; height: 720px; overflow: hidden;
    background: {bg};
    font-family: 'Inter', 'Segoe UI', sans-serif; color: {txt};
    display: flex; flex-direction: column;
  }}
  .header {{
    padding: 24px 48px 0;
    display: flex; justify-content: space-between; align-items: center;
  }}
  .brand {{ font-size: 14px; color: {acc}; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; }}
  .page-num {{ font-size: 13px; opacity: 0.5; }}
  .content {{
    flex: 1; display: flex; flex-direction: column; justify-content: center;
    padding: 24px 72px 40px;
  }}
  .section-num {{
    font-size: 12px; color: {acc}; font-weight: 600;
    letter-spacing: 1px; text-transform: uppercase; margin-bottom: 14px;
  }}
  h1 {{
    font-size: 36px; font-weight: 800; line-height: 1.2;
    background: linear-gradient(135deg, {h1s} 0%, {h1e} 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    margin-bottom: 24px;
  }}
  .divider {{
    width: 56px; height: 4px; border-radius: 2px;
    background: linear-gradient(90deg, {acc}, {acc2});
    margin-bottom: 24px;
  }}
  ul {{
    list-style: none; padding: 0;
    font-size: 18px; line-height: 1.6; color: {txt};
  }}
  li::before {{
    content: "▸ "; color: {acc}; font-weight: 700;
  }}
  .footer {{
    padding: 0 48px 20px;
    display: flex; align-items: center; gap: 12px;
  }}
  .progress-bar {{
    flex: 1; height: 3px; background: {bar}; border-radius: 2px;
  }}
  .progress-fill {{
    height: 100%; border-radius: 2px;
    background: linear-gradient(90deg, {acc}, {acc2});
    width: {round(current/total*100)}%;
  }}
</style>
</head>
<body>
  <div class="header">
    <span class="brand">⚡ Learnify</span>
    <span class="page-num">{current} / {total}</span>
  </div>
  {body_content}
  <div class="footer">
    <div class="progress-bar"><div class="progress-fill"></div></div>
  </div>
</body>
</html>"""


def _gtts_save(text: str, mp3_path: str):
    """Sync helper: dùng gTTS để tạo audio file."""
    tts = gTTS(text=text, lang="vi", slow=False)
    tts.save(mp3_path)


async def generate_tts(sections: list, tmp_dir: Path, voice_id: str = "vi-VN-HoaiMyNeural") -> list[Path]:
    """Tạo audio cho từng section. Hỗ trợ Edge TTS / ElevenLabs / gTTS fallback."""
    audio_paths = []
    loop = asyncio.get_event_loop()
    voice_cfg  = VOICES.get(voice_id, VOICES["vi-VN-HoaiMyNeural"])
    engine     = voice_cfg["engine"]
    edge_name  = voice_cfg.get("edgeName") or voice_id
    el_id      = voice_cfg.get("elId", "")
    print(f"  TTS engine: {engine} | voice: {voice_id}")

    for i, section in enumerate(sections):
        narration = section.get("narration", "") or section.get("voiceOver", "") or "Không có nội dung."
        mp3_path  = tmp_dir / f"audio_{i:03d}.mp3"

        if engine == "elevenlabs":
            # ── ElevenLabs — eleven_multilingual_v2 ──────────────────────────
            if not ELEVENLABS_API_KEY:
                print("  ElevenLabs: ELEVENLABS_API_KEY chưa set — fallback gTTS")
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    await loop.run_in_executor(pool, _gtts_save, narration, str(mp3_path))
            else:
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        resp = await client.post(
                            f"https://api.elevenlabs.io/v1/text-to-speech/{el_id}",
                            headers={
                                "xi-api-key": ELEVENLABS_API_KEY,
                                "Content-Type": "application/json",
                                "Accept": "audio/mpeg",
                            },
                            json={
                                "text": narration,
                                "model_id": ELEVENLABS_MODEL,
                                "voice_settings": {
                                    "stability": 0.5,
                                    "similarity_boost": 0.75,
                                    "style": 0.0,
                                    "use_speaker_boost": True,
                                },
                            },
                        )
                    if resp.status_code == 200:
                        mp3_path.write_bytes(resp.content)
                        print(f"  ElevenLabs OK ({len(resp.content)//1024}KB)")
                    else:
                        raise RuntimeError(f"ElevenLabs {resp.status_code}: {resp.text[:120]}")
                except Exception as e:
                    print(f"  ElevenLabs error: {e} — fallback gTTS")
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        await loop.run_in_executor(pool, _gtts_save, narration, str(mp3_path))

        elif engine == "edge":
            # ── Edge TTS ─────────────────────────────────────────────────────
            try:
                communicate = edge_tts.Communicate(narration, edge_name)
                await communicate.save(str(mp3_path))
            except Exception as e:
                print(f"  Edge TTS error: {e} — fallback gTTS")
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    await loop.run_in_executor(pool, _gtts_save, narration, str(mp3_path))

        else:
            # ── gTTS fallback ─────────────────────────────────────────────────
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                await loop.run_in_executor(pool, _gtts_save, narration, str(mp3_path))

        audio_paths.append(mp3_path)
        size_kb = mp3_path.stat().st_size // 1024
        print(f"  TTS {i+1}/{len(sections)} done ({size_kb}KB)")

    return audio_paths


def generate_srt(sections: list, audio_paths: list, output: Path):
    """Tạo file .srt từ narration text + audio timing.
    Chia narration thành chunks ~12 từ/line cho dễ đọc."""
    subs = []
    current_time = 0.0
    sub_index = 1

    for section, audio in zip(sections, audio_paths):
        # Probe audio duration
        probe = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", str(audio)
        ], capture_output=True, text=True)
        info = json.loads(probe.stdout)
        duration = float(info["streams"][0]["duration"])

        narration = section.get("narration", "")
        if not narration.strip():
            current_time += duration
            continue

        # ── Tách theo câu (dấu . ! ?) rồi chia nhỏ câu dài ──────────
        import re
        raw_sentences = re.split(r'(?<=[.!?])\s+', narration.strip())
        chunks = []
        for sent in raw_sentences:
            words = sent.split()
            if not words:
                continue
            if len(words) <= 15:
                chunks.append(sent)
            else:
                # Câu dài > 15 từ → chia thành sub-chunks ~12 từ
                for i in range(0, len(words), 12):
                    chunks.append(" ".join(words[i:i+12]))

        if not chunks:
            current_time += duration
            continue

        # Phân bổ thời gian theo tỷ lệ số từ (câu dài → thời gian nhiều hơn)
        word_counts = [len(c.split()) for c in chunks]
        total_words = sum(word_counts)

        for chunk, wc in zip(chunks, word_counts):
            chunk_duration = duration * (wc / total_words) if total_words > 0 else duration / len(chunks)
            start = current_time
            end = current_time + chunk_duration
            subs.append((sub_index, start, end, chunk))
            sub_index += 1
            current_time += chunk_duration

    # Write .srt
    with open(output, "w", encoding="utf-8") as f:
        for idx, start, end, text in subs:
            f.write(f"{idx}\n")
            f.write(f"{_fmt_srt_time(start)} --> {_fmt_srt_time(end)}\n")
            f.write(f"{text}\n\n")


def _fmt_srt_time(seconds: float) -> str:
    """Format seconds to SRT time: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def srt_to_vtt(srt_path: Path, vtt_path: Path):
    """Convert SRT → WebVTT for HTML5 <track> element."""
    with open(srt_path, "r", encoding="utf-8") as f:
        content = f.read()
    # SRT dùng dấu phẩy cho ms, VTT dùng dấu chấm
    content = content.replace(",", ".")
    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        f.write(content)
    print(f"  📝 VTT subtitle saved: {vtt_path}")


async def merge_video(slide_paths: list[Path], audio_paths: list[Path], output: Path, srt_path: Path = None):
    """Dùng FFmpeg để ghép slide PNG + audio MP3 thành MP4."""
    tmp_dir = output.parent
    segment_paths = []

    # ── Bước 1: Tạo segment video cho mỗi section ────────────────────────────
    for i, (slide, audio) in enumerate(zip(slide_paths, audio_paths)):
        seg_path = tmp_dir / f"seg_{i:03d}.mp4"

        # Get audio duration
        probe = subprocess.run([
            "ffprobe", "-v", "quiet", "-print_format", "json",
            "-show_streams", str(audio)
        ], capture_output=True, text=True)
        info = json.loads(probe.stdout)
        duration = float(info["streams"][0]["duration"])

        # Tạo video: slide ảnh tĩnh + audio
        cmd = [
            FFMPEG, "-y",
            "-loop", "1", "-i", str(slide),   # input: ảnh loop
            "-i", str(audio),                  # input: audio
            "-c:v", "libx264", "-tune", "stillimage",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            "-t", str(duration),
            "-vf", "scale=1280:720",
            str(seg_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg segment {i} failed: {result.stderr[-500:]}")

        segment_paths.append(seg_path)
        print(f"  Segment {i+1}/{len(slide_paths)} merged")

    # ── Bước 2: Concat tất cả segments ───────────────────────────────────────
    concat_list = tmp_dir / "concat.txt"
    with open(concat_list, "w") as f:
        for seg in segment_paths:
            f.write(f"file '{seg}'\n")

    # Concat tất cả segments (không burn subtitle — dùng soft VTT trên player)
    cmd = [
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c", "copy",
        str(output)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg concat failed: {result.stderr[-500:]}")

    print(f"  ✅ Final video: {output} ({output.stat().st_size//1024//1024}MB)")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

"""
SadTalker Server — FastAPI wrapper  (Optimized v2)
POST /preprocess : photo → face cache (chạy song song với TTS)
POST /generate   : photo + audio → talking head video (dùng cache nếu có)
GET  /health     : status check
"""

import argparse
import asyncio
import base64
import hashlib
import os
import shutil
import sys
import tempfile
import time
import traceback
from pathlib import Path

# ─── pkg_resources compatibility (Python 3.12+ / pip 24+) ───────────────────
try:
    import pkg_resources  # noqa: F401
    from pkg_resources import resource_filename  # noqa: F401
except Exception:
    import types as _types
    import importlib.util as _iu
    import os as _os

    def _resource_filename(package_or_requirement, resource_name):
        try:
            pkg_name = str(package_or_requirement).split("[")[0]
            spec = _iu.find_spec(pkg_name)
            if spec and spec.origin:
                return _os.path.join(_os.path.dirname(spec.origin), resource_name)
        except Exception:
            pass
        return resource_name

    _pkg = _types.ModuleType("pkg_resources")
    _pkg.require = lambda *a, **k: None
    _pkg.get_distribution = lambda *a, **k: None
    _pkg.DistributionNotFound = Exception
    _pkg.resource_filename = _resource_filename
    _pkg.resource_exists = lambda *a, **k: False
    _pkg.resource_string = lambda *a, **k: b""
    _pkg.resource_stream = lambda *a, **k: None
    _pkg.working_set = []
    sys.modules["pkg_resources"] = _pkg

# ─── torchvision compatibility (functional_tensor removed in 0.17+) ──────────
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except ImportError:
    import types as _tv_types
    import torchvision.transforms.functional as _tvf
    _ft = _tv_types.ModuleType("torchvision.transforms.functional_tensor")
    for _attr in dir(_tvf):
        if not _attr.startswith("__"):
            setattr(_ft, _attr, getattr(_tvf, _attr))
    sys.modules["torchvision.transforms.functional_tensor"] = _ft

# ─── numpy deprecated aliases (removed in numpy 1.24+) ───────────────────────
import numpy as _np
for _alias, _builtin in [
    ("float",   float),
    ("int",     int),
    ("complex", complex),
    ("bool",    bool),
    ("object",  object),
    ("str",     str),
]:
    if not hasattr(_np, _alias):
        setattr(_np, _alias, _builtin)

# ─── numpy Warning classes removed in numpy 2.0+ ─────────────────────────────
if not hasattr(_np, "VisibleDeprecationWarning"):
    _np.VisibleDeprecationWarning = DeprecationWarning
if not hasattr(_np, "RankWarning"):
    _np.RankWarning = RuntimeWarning

# ─── numpy.array inhomogeneous fix ────────────────────────────────────────────
_orig_np_array = _np.array
def _compat_np_array(obj, *args, **kwargs):
    try:
        return _orig_np_array(obj, *args, **kwargs)
    except ValueError as _e:
        if "inhomogeneous" in str(_e) and "dtype" not in kwargs:
            return _orig_np_array(obj, *args, dtype=object, **kwargs)
        raise
_np.array = _compat_np_array

import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── SadTalker repo path ──────────────────────────────────────────────────────
SADTALKER_DIR = Path(__file__).parent / "repo"
sys.path.insert(0, str(SADTALKER_DIR))

# ─── Patch safetensors → force float32 khi load từ file ──────────────────────
# Checkpoint SadTalker_V0.0.2_256.safetensors lưu weights ở fp16.
# Hàm load_file trả về dict tensor fp16, sau đó load_state_dict gán vào model.
# .float() gọi SAU load_state_dict không reliable khi params bị freeze.
# → Patch tại nguồn: mọi tensor từ safetensors đều được ép về float32.
try:
    import safetensors.torch as _st
    _st_orig_load = _st.load_file
    def _st_load_fp32(path, *args, **kwargs):
        tensors = _st_orig_load(path, *args, **kwargs)
        return {k: v.float() if v.is_floating_point() else v for k, v in tensors.items()}
    _st.load_file = _st_load_fp32
    print("[SadTalker] ✅ safetensors patch: tất cả tensors → float32")
except Exception as _patch_err:
    print(f"[SadTalker] safetensors patch skip: {_patch_err}")


# ─── Face cache: sha256(photo_bytes) → saved tmp dir path ────────────────────
# Mỗi entry lưu: {"first_coeff": str, "crop_pic": str, "crop_info": any, "dir": str}
_face_cache: dict[str, dict] = {}
_FACE_CACHE_MAX = 20   # tối đa 20 ảnh cached (tránh tràn RAM)

# ─── Global pipeline ──────────────────────────────────────────────────────────
_pipeline = None
_server_args = None


def _load_pipeline_blocking(args):
    """Load SadTalker models — chạy 1 lần lúc startup."""
    global _pipeline
    if _pipeline is not None:
        return _pipeline

    print("[SadTalker] 🔄 Loading models (startup)...")
    t0 = time.time()
    try:
        from src.utils.preprocess import CropAndExtract
        from src.test_audio2coeff import Audio2Coeff
        from src.facerender.animate import AnimateFromCoeff
        from src.utils.init_path import init_path

        import torch

        # ── Torch optimizations ──────────────────────────────────────────────
        n_threads = os.cpu_count() or 4
        torch.set_num_threads(n_threads)
        print(f"[SadTalker] torch threads = {n_threads}")

        if args.device == "cuda":
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.deterministic = False
            print("[SadTalker] CUDA: cudnn.benchmark = True")

        sadtalker_paths = init_path(
            args.checkpoint_dir,
            os.path.join(SADTALKER_DIR, "src/config"),
            args.size,
            args.old_version,
            args.preprocess,
        )

        preprocess_model  = CropAndExtract(sadtalker_paths, args.device)
        audio_to_coeff    = Audio2Coeff(sadtalker_paths, args.device)
        animate_from_coeff = AnimateFromCoeff(sadtalker_paths, args.device)

        # ── Ép về float32 ─────────────────────────────────────────────────────
        # AnimateFromCoeff là plain Python class (KHÔNG phải nn.Module)
        # → .to() trên object cha KHÔNG có tác dụng.
        # Phải gọi .float() trực tiếp trên từng nn.Module bên trong.
        import torch
        _submodels = [
            ("preprocess_model",   None),           # CropAndExtract — không phải nn.Module
            ("audio_to_coeff",     None),           # Audio2Coeff — không phải nn.Module
            # AnimateFromCoeff internals:
            ("generator",          animate_from_coeff.generator),
            ("kp_extractor",       animate_from_coeff.kp_extractor),
            ("he_estimator",       animate_from_coeff.he_estimator),
            ("mapping",            animate_from_coeff.mapping),
        ]
        for _name, _mod in _submodels:
            if _mod is None:
                continue
            try:
                _mod.float()
                print(f"[SadTalker] ✅ {_name} → float32")
            except Exception as _e:
                print(f"[SadTalker] float32 skip {_name}: {_e}")

        # ── CUDA: chuyển TẤT CẢ models → fp16 để đồng nhất ─────────────────
        # animate.py cast inputs về dtype của generator (fp16 khi CUDA).
        # Nếu chỉ generator là fp16, còn mapping/kp_extractor/he_estimator là
        # float32 → source_semantics (fp16) × mapping (float32) = crash.
        # → Tất cả phải cùng fp16 trên CUDA.
        if args.device == "cuda":
            _cuda_models = [
                ("generator",    animate_from_coeff.generator),
                ("kp_extractor", animate_from_coeff.kp_extractor),
                ("he_estimator", animate_from_coeff.he_estimator),
                ("mapping",      animate_from_coeff.mapping),
            ]
            for _cname, _cmod in _cuda_models:
                try:
                    _cmod.half()
                    print(f"[SadTalker] ✅ {_cname} → fp16 (CUDA)")
                except Exception as _ce:
                    print(f"[SadTalker] fp16 skip {_cname}: {_ce}")

        _pipeline = {
            "preprocess_model":  preprocess_model,
            "audio_to_coeff":    audio_to_coeff,
            "animate_from_coeff": animate_from_coeff,
            "sadtalker_paths":   sadtalker_paths,
        }
        print(f"[SadTalker] ✅ Models loaded in {time.time()-t0:.1f}s")
    except Exception as e:
        print(f"[SadTalker] ❌ Load model failed: {e}")
        traceback.print_exc()
        raise
    return _pipeline


# ─── Lifespan: load model khi startup, cleanup khi shutdown ──────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load model trong thread pool
    loop = asyncio.get_event_loop()
    if _server_args is not None:
        try:
            await loop.run_in_executor(None, _load_pipeline_blocking, _server_args)
        except Exception:
            print("[SadTalker] ⚠️  Model load failed at startup — will retry on first request")
    yield
    # Shutdown: cleanup face cache dirs
    for entry in _face_cache.values():
        shutil.rmtree(entry.get("dir", ""), ignore_errors=True)
    _face_cache.clear()
    print("[SadTalker] 👋 Shutdown complete")


app = FastAPI(title="SadTalker Server", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Schemas ──────────────────────────────────────────────────────────────────
class PreprocessRequest(BaseModel):
    photo_base64: str
    preprocess: str  = "crop"   # full | crop | resize
    size: int        = 256


class PreprocessResponse(BaseModel):
    success: bool
    cache_key: str | None = None
    elapsed: float | None = None
    error: str | None     = None


class GenerateRequest(BaseModel):
    photo_base64: str
    audio_base64: str
    still: bool            = True
    preprocess: str        = "crop"
    size: int              = 256
    expression_scale: float = 1.0
    face_cache_key: str | None = None   # nếu có → bỏ qua face preprocess


class GenerateResponse(BaseModel):
    success: bool
    video_base64: str | None = None
    elapsed: float | None    = None
    error: str | None        = None


# ─── Helper: tạo cache key từ ảnh ────────────────────────────────────────────
def _photo_cache_key(photo_bytes: bytes, preprocess: str, size: int) -> str:
    h = hashlib.sha256(photo_bytes + f"|{preprocess}|{size}".encode()).hexdigest()[:16]
    return h


# ─── Preprocess face (blocking) ───────────────────────────────────────────────
def _run_preprocess(photo_bytes: bytes, preprocess: str, size: int) -> dict:
    """CropAndExtract — caching theo cache_key. Chạy trong thread pool."""
    cache_key = _photo_cache_key(photo_bytes, preprocess, size)

    # Cache hit
    if cache_key in _face_cache:
        print(f"[SadTalker] 🟢 Face CACHE HIT — key={cache_key}")
        return _face_cache[cache_key]

    p = _load_pipeline_blocking(_server_args)

    # Lưu vào tmp dir riêng (persistent trong RAM cache)
    cache_dir = Path(tempfile.mkdtemp(prefix=f"sadtalker_face_{cache_key}_"))
    photo_path = cache_dir / "photo.png"
    photo_path.write_bytes(photo_bytes)

    print(f"[SadTalker] 🔵 Face CACHE MISS — preprocess key={cache_key}")
    first_coeff_path, crop_pic_path, crop_info = p["preprocess_model"].generate(
        str(photo_path), str(cache_dir), preprocess,
        source_image_flag=True, pic_size=size,
    )
    if first_coeff_path is None:
        shutil.rmtree(cache_dir, ignore_errors=True)
        raise RuntimeError("Không detect được khuôn mặt trong ảnh")

    entry = {
        "first_coeff": first_coeff_path,
        "crop_pic":    crop_pic_path,
        "crop_info":   crop_info,
        "dir":         str(cache_dir),
    }

    # Giới hạn cache size — xóa entry cũ nhất
    if len(_face_cache) >= _FACE_CACHE_MAX:
        oldest_key = next(iter(_face_cache))
        old_entry = _face_cache.pop(oldest_key)
        shutil.rmtree(old_entry.get("dir", ""), ignore_errors=True)
        print(f"[SadTalker] 🗑️  Cache evicted key={oldest_key}")

    _face_cache[cache_key] = entry
    return entry


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "model_loaded": _pipeline is not None,
        "face_cache_size": len(_face_cache),
    }


@app.post("/preprocess", response_model=PreprocessResponse)
async def preprocess_face(req: PreprocessRequest):
    """
    Preprocess ảnh GV (CropAndExtract) và cache kết quả.
    Gọi endpoint này SONG SONG với TTS để tiết kiệm thời gian.
    """
    t0 = time.time()
    try:
        photo_bytes = base64.b64decode(req.photo_base64)
        cache_key   = _photo_cache_key(photo_bytes, req.preprocess, req.size)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, _run_preprocess, photo_bytes, req.preprocess, req.size
        )
        elapsed = round(time.time() - t0, 1)
        print(f"[SadTalker] /preprocess done in {elapsed}s — key={cache_key}")
        return PreprocessResponse(success=True, cache_key=cache_key, elapsed=elapsed)
    except Exception as e:
        traceback.print_exc()
        return PreprocessResponse(success=False, error=str(e))


@app.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    t0 = time.time()
    tmpdir = Path(tempfile.mkdtemp(prefix="sadtalker_gen_"))

    try:
        photo_bytes = base64.b64decode(req.photo_base64)
        audio_path  = tmpdir / "audio.wav"
        audio_path.write_bytes(base64.b64decode(req.audio_base64))

        loop = asyncio.get_event_loop()
        video_path = await loop.run_in_executor(
            None,
            _run_sadtalker,
            photo_bytes, str(audio_path), str(tmpdir),
            req.still, req.preprocess, req.size,
            req.expression_scale, req.face_cache_key,
        )

        video_b64 = base64.b64encode(Path(video_path).read_bytes()).decode()
        elapsed = round(time.time() - t0, 1)
        print(f"[SadTalker] ✅ /generate done in {elapsed}s — {Path(video_path).stat().st_size//1024}KB")
        return GenerateResponse(success=True, video_base64=video_b64, elapsed=elapsed)

    except Exception as e:
        traceback.print_exc()
        return GenerateResponse(success=False, error=str(e))

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _run_sadtalker(
    photo_bytes: bytes,
    audio_path: str,
    out_dir: str,
    still: bool,
    preprocess: str,
    size: int,
    expression_scale: float,
    face_cache_key: str | None,
) -> str:
    """Chạy full SadTalker pipeline trong thread pool."""
    import torch
    from src.generate_batch import get_data
    from src.generate_facerender_batch import get_facerender_data

    p = _load_pipeline_blocking(_server_args)

    # ── Bước 1: Lấy face data (từ cache hoặc preprocess mới) ─────────────────
    if face_cache_key and face_cache_key in _face_cache:
        face = _face_cache[face_cache_key]
        print(f"[SadTalker] 🟢 Using cached face — key={face_cache_key}")
    else:
        # Fallback: preprocess tại chỗ (không có cache)
        face = _run_preprocess(photo_bytes, preprocess, size)

    first_coeff_path = face["first_coeff"]
    crop_pic_path    = face["crop_pic"]
    crop_info        = face["crop_info"]

    # ── Bước 2: Audio2Coeff ───────────────────────────────────────────────────
    batch = get_data(
        first_coeff_path, audio_path,
        _server_args.device,
        ref_eyeblink_coeff_path=None,
        still=still,
    )
    coeff_path = p["audio_to_coeff"].generate(
        batch, out_dir, _server_args.pose_style,
        ref_pose_coeff_path=None,
    )

    # ── Bước 3: AnimateFromCoeff (render) ─────────────────────────────────────
    data = get_facerender_data(
        coeff_path, crop_pic_path, first_coeff_path, audio_path,
        batch_size=_server_args.batch_size,
        input_yaw_list=None, input_pitch_list=None, input_roll_list=None,
        expression_scale=expression_scale,
        still_mode=still,
        preprocess=preprocess,
        size=size,
    )

    result = p["animate_from_coeff"].generate(
        data, out_dir, crop_pic_path, crop_info,
        enhancer=_server_args.enhancer,
        background_enhancer=_server_args.background_enhancer,
        preprocess=preprocess,
        img_size=size,
    )
    return result


# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port",            type=int,   default=8100)
    parser.add_argument("--checkpoint_dir",  type=str,   default=str(Path(__file__).parent / "repo" / "checkpoints"))
    parser.add_argument("--device",          type=str,   default=None)
    parser.add_argument("--size",            type=int,   default=256)
    parser.add_argument("--preprocess",      type=str,   default="crop")
    parser.add_argument("--pose_style",      type=int,   default=0)
    parser.add_argument("--batch_size",      type=int,   default=4)   # ✅ tăng từ 2 → 4
    parser.add_argument("--enhancer",        type=str,   default=None)
    parser.add_argument("--background_enhancer", type=str, default=None)
    parser.add_argument("--old_version",     action="store_true")
    _server_args = parser.parse_args()

    import torch
    if _server_args.device is None:
        _server_args.device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[SadTalker] Device: {_server_args.device}")

    uvicorn.run(app, host="0.0.0.0", port=_server_args.port)

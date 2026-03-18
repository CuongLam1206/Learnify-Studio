@echo off
:: ============================================================
:: Learnify — Stable Diffusion Setup Script (Windows)
:: Tải SDXL model về máy và cài dependencies
:: ============================================================
echo.
echo =============================================
echo   Learnify SD Setup
echo =============================================
echo.

:: Kiểm tra Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python chua duoc cai. Download tai: https://www.python.org/downloads/
    pause & exit /b 1
)

:: Cài SD Python dependencies
echo [1/3] Cai SD dependencies (torch, diffusers, ...)
cd /d "%~dp0..\services\video-worker"
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install diffusers transformers accelerate huggingface_hub
if %errorlevel% neq 0 (
    echo [WARN] Cai torch CUDA that bai, thu nua voi CPU-only...
    pip install torch torchvision
    pip install diffusers transformers accelerate huggingface_hub
)
echo [1/3] Done!

:: Tải model SDXL
echo.
echo [2/3] Tai model SDXL Base 1.0 tu HuggingFace (~6.9GB)...
echo       Co the mat 10-30 phut tuy toc do mang.
cd /d "%~dp0.."
huggingface-cli download stabilityai/stable-diffusion-xl-base-1.0 ^
    --local-dir ./sd-model ^
    --include "*.safetensors" "*.json" "*.txt" ^
    --exclude "*.fp32*" "vae/diffusion_pytorch_model.bin"
if %errorlevel% neq 0 (
    echo [ERROR] Tai model that bai. Kiem tra internet va thu lai.
    pause & exit /b 1
)
echo [2/3] Model da tai xong!

:: Kiểm tra nhanh
echo.
echo [3/3] Kiem tra server...
cd /d "%~dp0..\services\video-worker"
python -c "from diffusers import AutoPipelineForText2Image; print('diffusers OK')"
if %errorlevel% neq 0 (
    echo [ERROR] diffusers loi. Chay lai: pip install diffusers transformers accelerate
    pause & exit /b 1
)
echo [3/3] OK!

echo.
echo =============================================
echo   Setup hoan tat!
echo =============================================
echo.
echo De chay SD server:
echo   npm run sd:start
echo.
echo Hoac thu cong:
echo   cd services\video-worker
echo   python sd_server.py --model ../../sd-model --port 7860
echo.
echo Sau khi server chay, update .env.local:
echo   SD_API_URL=http://localhost:7860
echo.
pause

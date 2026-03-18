@echo off
:: ============================================================
:: Learnify — Start All Services
:: Chạy 1 file này để khởi động toàn bộ hệ thống:
::   - Next.js (port 3000)
::   - Video Worker FastAPI (port 8000)  
::   - SD Server (port 7860) — optional, chỉ nếu SD_API_URL được set
:: ============================================================

set ROOT=%~dp0
set WORKER_DIR=%ROOT%services\video-worker
set SD_MODEL=%ROOT%sd-model

:: Đọc SD_API_URL từ .env.local
set SD_ENABLED=0
for /f "tokens=1,2 delims==" %%a in (.env.local) do (
    if "%%a"=="SD_API_URL" (
        if not "%%b"=="" set SD_ENABLED=1
    )
)

echo.
echo  ==========================================
echo    Learnify Agent - Starting services...
echo  ==========================================
echo.

:: 1. Video Worker (FastAPI)
echo  [1/3] Starting Video Worker (port 8000)...
start "Learnify - Video Worker" cmd /k "cd /d %WORKER_DIR% && python main.py"
timeout /t 2 /nobreak >nul

:: 2. SD Server (chỉ nếu SD_API_URL được set trong .env.local)
if %SD_ENABLED%==1 (
    echo  [2/3] Starting SD Server (port 7860)...
    if exist "%SD_MODEL%\model_index.json" (
        start "Learnify - SD Server" cmd /k "cd /d %WORKER_DIR% && python sd_server.py --model %SD_MODEL% --port 7860"
        timeout /t 2 /nobreak >nul
    ) else (
        echo  [2/3] WARN: SD model chua duoc tai. Chay: npm run sd:setup
    )
) else (
    echo  [2/3] SD Server: Disabled (SD_API_URL chua set trong .env.local^)
)

:: 3. Next.js Dev Server
echo  [3/3] Starting Next.js (port 3000)...
start "Learnify - Next.js" cmd /k "cd /d %ROOT% && npm run dev"

echo.
echo  ==========================================
echo    Tat ca services da duoc khoi dong!
echo    App: http://localhost:3000
echo    Worker: http://localhost:8000
echo    SD API: http://localhost:7860 (neu bat)
echo  ==========================================
echo.
echo  Close cua so nay de KHONG tat services.
echo  De tat: dong tung cua so terminal.
echo.
pause

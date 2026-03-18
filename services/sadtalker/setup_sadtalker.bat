@echo off
echo ========================================
echo   Setup SadTalker Tier-1 Avatar Server
echo ========================================

cd /d %~dp0

echo.
echo [0/4] Kiem tra thu muc repo...
if not exist "repo\src" (
    echo ❌ Chua clone SadTalker!
    echo    Chay lenh: git clone https://github.com/OpenTalker/SadTalker.git services\sadtalker\repo
    pause
    exit /b 1
)
echo OK: repo\src ton tai

echo.
echo [1/4] Kiem tra Python...
python --version
if errorlevel 1 (
    echo ❌ Python chua duoc cai dat!
    pause
    exit /b 1
)

echo.
echo [2/4] Cai dependencies tu repo\requirements.txt...
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install fastapi uvicorn httpx python-dotenv
pip install -r repo\requirements.txt

echo.
echo [3/4] Cai them gfpgan, basicsr cho enhancer...
pip install basicsr facexlib gfpgan

echo.
echo [4/4] Download SadTalker checkpoints (~300MB)...
if not exist "repo\checkpoints" mkdir repo\checkpoints
if not exist "repo\gfpgan\weights" mkdir repo\gfpgan\weights

python -c "
from pathlib import Path
import urllib.request, sys

base_url = 'https://huggingface.co/vinthony/SadTalker/resolve/main'
files = [
    ('repo/checkpoints/SadTalker_V0.0.2_256.safetensors', f'{base_url}/SadTalker_V0.0.2_256.safetensors'),
    ('repo/checkpoints/SadTalker_V0.0.2_512.safetensors', f'{base_url}/SadTalker_V0.0.2_512.safetensors'),
    ('repo/checkpoints/mapping_00229-model.pth.tar',      f'{base_url}/mapping_00229-model.pth.tar'),
    ('repo/checkpoints/mapping_00109-model.pth.tar',      f'{base_url}/mapping_00109-model.pth.tar'),
    ('repo/gfpgan/weights/alignment_WFLW_4HG.pth',        'https://github.com/xinntao/facexlib/releases/download/v0.1.0/alignment_WFLW_4HG.pth'),
    ('repo/gfpgan/weights/detection_Resnet50_Final.pth',  'https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth'),
]
for dest, url in files:
    if Path(dest).exists():
        print(f'  [skip] {dest}')
        continue
    print(f'  Downloading {dest}...')
    try:
        urllib.request.urlretrieve(url, dest)
        print(f'  OK')
    except Exception as e:
        print(f'  FAIL: {e}')
        sys.exit(1)
print('Checkpoints OK!')
"

echo.
echo ========================================
echo ✅ Setup hoan tat!
echo.
echo Chay SadTalker server (Terminal 3):
echo   cd services\sadtalker
echo   python sadtalker_server.py --port 8100
echo ========================================
pause

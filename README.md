# 🎓 Learnify Agent — AI Video Lecture Generator

Xem các video được tạo tại: https://learnify-studio.vercel.app/. Đăng nhập để xem:TK:admin@learnify.vn MK:Abc123456.

Lưu ý: Không thể tạo thêm video do Runpod đã tắt. Có thể xem video được tạo Tab video bài giảng

Nền tảng tạo video bài giảng AI tự động từ đề cương môn học. Ba tầng chất lượng: **Tier 1** — Talking Avatar (SadTalker, tự host miễn phí), **Tier 2** — Slide + TTS, **Tier 3** — Animation.

---

## 📋 Yêu cầu hệ thống

| Công cụ | Phiên bản | Ghi chú |
|---------|-----------|---------|
| Node.js | ≥ 18 | |
| npm | ≥ 9 | |
| Python | ≥ 3.10 | |
| FFmpeg | latest | Thêm vào PATH |

---

## ⚙️ Cài đặt

### 1. Clone & cài Node dependencies

```bash
git clone <repo-url>
cd Learnify_Agent
npm install
```

### 2. Cấu hình biến môi trường

```bash
cp .env.example .env.local
```

Mở `.env.local` và điền các key:

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database (SQLite cho dev, PostgreSQL cho prod)
DATABASE_URL="file:./prisma/dev.db"

# Google Gemini (tạo script bài giảng)
GEMINI_API_KEY=AIza...

# SadTalker server (Tier 1 — talking avatar tự host)
SADTALKER_URL=http://localhost:8100

# Python Worker
PYTHON_WORKER_URL=http://localhost:8000
```

> **Tier 2 + Pexels images** (tuỳ chọn): thêm `PEXELS_API_KEY` vào `services/video-worker/.env`

### 3. Khởi tạo database

```bash
npm run db:generate   # tạo Prisma client
npm run db:push       # sync schema → DB
```

### 4. Cài Python Worker

```bash
cd services/video-worker
pip install -r requirements.txt
playwright install chromium
```

Tạo file `services/video-worker/.env`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
HEYGEN_API_KEY=sk_...
PEXELS_API_KEY=        # tuỳ chọn, để trống nếu không có
```

### 5. Cài SadTalker (Tier 1 — Talking Avatar)

SadTalker đã được clone sẵn vào `services/sadtalker/repo/`. Chỉ cần cài dependencies:

```bash
# Tạo conda env riêng (không lộn với learnify-worker)
conda create -n sadtalker python=3.10 -y
conda activate sadtalker

# Cài PyTorch (CPU)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# Cài dependencies
pip install -r services/sadtalker/repo/requirements.txt
pip install fastapi uvicorn kornia safetensors
```

> **GPU (CUDA):** Thay `--index-url .../cpu` bằng `--index-url https://download.pytorch.org/whl/cu121` để tăng tốc ~5x.

Checkpoints (đã có sẵn tại `services/sadtalker/repo/checkpoints/`):
```
SadTalker_V0.0.2_256.safetenconda activate learnify-worker
cd services/video-worker
python main.pysors   (~690MB)
mapping_00109-model.pth.tar         (~148MB)
mapping_00229-model.pth.tar         (~148MB)
```

---


## 🚀 Chạy project

**Mở 3 terminal song song:**

### Terminal 1 — Next.js Frontend

```bash
conda activate learnify-worker
npm run dev
```

→ Mở trình duyệt tại **http://localhost:3000**

### Terminal 2 — Python Video Worker

```bash
conda activate learnify-worker
cd services/video-worker
python main.py
```

→ Worker chạy tại **http://localhost:8000**

### Terminal 3 — SadTalker Server (chỉ dùng khi tạo Tier 1)

```bash
conda activate sadtalker
cd services/sadtalker
python sadtalker_server.py --port 8100 --batch_size 4
```

→ SadTalker chạy tại **http://localhost:8100**

Khi khởi động thành công sẽ thấy:
```
[SadTalker] 🔄 Loading models (startup)...
[SadTalker] ✅ generator → float32
[SadTalker] ✅ Models loaded in X.Xs
INFO:     Uvicorn running on http://0.0.0.0:8100
```

> **Lưu ý:** SadTalker load model mất ~1–2 phút lần đầu. Giữ terminal mở trong suốt quá trình tạo video.

---

## 🎬 Sử dụng

1. Vào **http://localhost:3000**
2. Chọn **"Tạo Video Mới"** trên Dashboard
3. Nhập môn học, thời lượng, đề cương
4. Chọn tier:
   - **Tier 1** — Talking Avatar (SadTalker tự host, miễn phí — cần Terminal 3 đang chạy + upload ảnh giảng viên)
   - **Tier 2** — Slide + TTS (gTTS, miễn phí)
5. Nhấn **"Tạo Video"** → theo dõi tiến trình real-time
6. Video hoàn thành → xem tại trang Video Detail

---

## 🗂️ Cấu trúc project

```
Learnify_Agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── video/          # API routes: generate-script, process, status
│   │   ├── dashboard/          # UI: video list, video detail, create
│   │   └── proposal/           # AI Video proposal page
│   └── components/
├── services/
│   ├── video-worker/           # Python FastAPI worker (Tier 2/3)
│   │   ├── main.py             # Pipeline: Slide render + TTS + FFmpeg merge
│   │   └── requirements.txt
│   └── sadtalker/              # SadTalker server (Tier 1)
│       ├── sadtalker_server.py # FastAPI wrapper với face cache + song song
│       └── repo/               # SadTalker repo + checkpoints
├── prisma/
│   └── schema.prisma           # DB schema: VideoJob, Instructor, Course...
└── .env.local                  # Biến môi trường (không commit)
```

---

## 🛠️ Script hữu ích

```bash
npm run db:studio    # Mở Prisma Studio xem DB tại localhost:5555
npm run db:push      # Sync schema sau khi sửa schema.prisma
npm run build        # Build production
```

---

## 🔑 API Keys cần thiết

| Key | Mục đích | Lấy ở đâu | Bắt buộc |
|-----|----------|-----------|----------|
| `GEMINI_API_KEY` | Tạo script bài giảng | [aistudio.google.com](https://aistudio.google.com) | ✅ |
| `HEYGEN_API_KEY` | Tier 1 avatar video | [heygen.com](https://heygen.com) | Chỉ Tier 1 |
| `PEXELS_API_KEY` | Ảnh minh hoạ slide | [pexels.com/api](https://pexels.com/api) | ❌ Tuỳ chọn |

---

## ❓ Troubleshooting

**Worker không connect được:**
→ Kiểm tra `PYTHON_WORKER_URL=http://localhost:8000` trong `.env.local`

**FFmpeg not found:**
→ Cài FFmpeg và thêm vào PATH. Kiểm tra bằng `ffmpeg -version`

**Pexels 403 Forbidden:**
→ Kiểm tra `PEXELS_API_KEY` trong `services/video-worker/.env` (không phải `.env.local`)

**Slide không render được:**
→ Chạy `playwright install chromium` trong thư mục `services/video-worker/`

**SadTalker: `No module named 'kornia'`:**
→ `conda activate sadtalker && pip install kornia`

**SadTalker: `Input type (float) and bias type (Half) should be the same`:**
→ Đây là lỗi fp16/float32 mismatch. Đã được xử lý trong `sadtalker_server.py`. Nếu gặp lại, kiểm tra đang dùng đúng conda env `sadtalker`.

**SadTalker Load model chậm (1–2 phút):**
→ Bình thường — chỉ xảy ra lần đầu khi khởi động server. Giữ terminal mở.

**Tier 1 báo "Chưa có ảnh giảng viên":**
→ Tier 1 yêu cầu upload ảnh giảng viên khi tạo video. Kiểm tra trong form tạo video.

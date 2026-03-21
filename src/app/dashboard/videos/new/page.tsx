"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
    FileText, Wand2, CheckCircle2, Rocket,
    ChevronRight, ChevronLeft, Loader2, AlertCircle,
    Clock, BookOpen, Edit3, Upload, X, FileUp, Plus, Image as ImageIcon
} from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
type ScriptSection = {
    index: number;
    title: string;
    durationSeconds: number;
    narration: string;
    slideContent: string;
    imageKeyword?: string;
    customImageBase64?: string;
};


type GeneratedScript = {
    title: string;
    estimatedDuration: string;
    totalWords: number;
    sections: ScriptSection[];
};



const STEPS = [
    { id: 1, label: "Nhập thông tin", icon: FileText },
    { id: 2, label: "Sinh Script", icon: Wand2 },
    { id: 3, label: "Chọn Tier", icon: Rocket },
    { id: 4, label: "Xác nhận", icon: CheckCircle2 },
];

const TIERS = [
    {
        id: 1,
        emoji: "🔴",
        name: "Tier 1 — Avatar AI",
        desc: "Mặt GV thật nói trong video. Chuyên nghiệp nhất.",
        bestFor: "Intro bài giảng, video marketing",
        pros: ["Mặt & giọng GV thật", "Chuyên nghiệp cao", "Ấn tượng học viên"],
        cons: ["Chi phí cao hơn", "Thời gian render ~10 phút"],
        tech: "HeyGen Avatar AI",
        color: "red",
    },
    {
        id: 2,
        emoji: "🟡",
        name: "Tier 2 — Slide + Voice",
        desc: "Slide đẹp + giọng đọc clone từ GV. Tối ưu chi phí.",
        bestFor: "Nội dung lý thuyết chính (80% bài giảng)",
        pros: ["Giọng GV thật (clone)", "Chi phí rất thấp", "Render ~5 phút"],
        cons: ["Không có mặt GV"],
        tech: "F5-TTS + FFmpeg",
        color: "yellow",
        recommended: true,
    },
];

// ─── Upload Zone Component ───────────────────────────────────────────────────────────
// Đơn giản: user chọn file → báo file lên parent. Script generation xảy ra khi nhấn "Sinh Script"
function UploadZone({
    selectedFile,
    onFileSelect,
}: {
    selectedFile: File | null;
    onFileSelect: (file: File | null) => void;
}) {
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const ALLOWED = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
    ];

    const handleFile = (file: File) => {
        if (!ALLOWED.includes(file.type)) {
            toast.error("Chỉ hỗ trợ PDF, PPTX, DOCX, DOC!");
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            toast.error("File tối đa 20MB!");
            return;
        }
        onFileSelect(file);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const getFileIcon = (name: string) => {
        if (name.endsWith(".pdf")) return "📄";
        if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "📊";
        if (name.endsWith(".docx") || name.endsWith(".doc")) return "📝";
        return "📎";
    };

    return (
        <div className="space-y-4">
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx,.ppt,.docx,.doc"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {selectedFile ? (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-blue-50 border border-blue-200">
                    <span className="text-3xl">{getFileIcon(selectedFile.name)}</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {(selectedFile.size / 1024).toFixed(0)} KB • Sẽ được đọc khi nhấn "Sinh Script"
                        </p>
                    </div>
                    <button
                        onClick={() => { onFileSelect(null); if (inputRef.current) inputRef.current.value = ""; }}
                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ) : (
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                        "border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all",
                        dragOver
                            ? "border-brand-400 bg-brand-500/10"
                            : "border-surface-border hover:border-slate-500 hover:bg-white/2"
                    )}
                >
                    <div className="flex flex-col items-center gap-3">
                        <div className={cn(
                            "w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
                            dragOver ? "bg-brand-600/30" : "bg-surface-card"
                        )}>
                            <FileUp className={cn("w-8 h-8", dragOver ? "text-brand-400" : "text-slate-500")} />
                        </div>
                        <div>
                            <p className="text-gray-700 font-medium">
                                Kéo thả file vào đây hoặc{" "}
                                <span className="text-brand-600 underline cursor-pointer">chọn file</span>
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                                Hỗ trợ: PDF, PPTX, DOCX, DOC — Tối đa 20MB
                            </p>
                        </div>
                        <div className="flex gap-2 mt-1">
                            {["PDF", "PPTX", "DOCX", "DOC"].map((fmt) => (
                                <span key={fmt} className="text-xs px-2.5 py-1 rounded-full bg-surface-card border border-surface-border text-slate-400">
                                    {fmt}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                    AI sẽ đọc toàn bộ nội dung tài liệu và dùng làm nội dung bài giảng khi bạn nhấn "Sinh Script".
                </p>
            </div>
        </div>
    );
}

// ─── Step 1: Input Form ─────────────────────────────────────────────────────────────────────────────────────
function StepInput({
    form,
    onChange,
    selectedFile,
    onFileSelect,
}: {
    form: { subject: string; outline: string; durationMinutes: number; rawContent: string };
    onChange: (k: string, v: string | number) => void;
    selectedFile: File | null;
    onFileSelect: (f: File | null) => void;
}) {
    const [inputMode, setInputMode] = useState<"manual" | "upload">("manual");

    return (
        <div className="space-y-6">
            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-surface-card rounded-xl border border-surface-border w-fit">
                <button
                    onClick={() => setInputMode("manual")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        inputMode === "manual"
                            ? "bg-brand-600 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    )}
                >
                    <Edit3 className="w-3.5 h-3.5" />
                    ✏️ Nhập tay
                </button>
                <button
                    onClick={() => setInputMode("upload")}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                        inputMode === "upload"
                            ? "bg-brand-600 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    )}
                >
                    <Upload className="w-3.5 h-3.5" />
                    📎 Upload file
                </button>
            </div>

            {/* Upload mode */}
            {inputMode === "upload" && (
                <UploadZone selectedFile={selectedFile} onFileSelect={onFileSelect} />
            )}

            {/* Manual mode hoặc sau khi upload (để review/edit) */}
            {inputMode === "manual" && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Môn học / Chủ đề <span className="text-red-400">*</span>
                        </label>
                        <input
                            className="input-field"
                            placeholder="VD: Kinh tế Vi mô — Cung, Cầu và Cân bằng Thị trường"
                            value={form.subject}
                            onChange={(e) => onChange("subject", e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                            Outline bài giảng <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            className="input-field min-h-[180px] resize-none"
                            placeholder={`VD:\n1. Khái niệm cung, cầu và các yếu tố ảnh hưởng\n2. Quy luật cung cầu, đường cung đường cầu\n3. Trạng thái cân bằng thị trường\n4. Dư cung, dư cầu và biến động giá\n5. Bài tập: phân tích thị trường hàng hoá cụ thể`}
                            value={form.outline}
                            onChange={(e) => onChange("outline", e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Nhập vài dòng outline cơ bản. AI sẽ tự mở rộng thành script chi tiết.
                        </p>
                    </div>
                </>
            )}

            {/* Duration — chỉ hiện khi nhập tay */}
            {inputMode === "manual" && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Thời lượng bài giảng
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                        {[5, 10, 15, 20, 30, 45].map((min) => (
                            <button
                                key={min}
                                onClick={() => onChange("durationMinutes", min)}
                                className={cn(
                                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                                    form.durationMinutes === min
                                        ? "bg-brand-600 border-brand-700 text-white shadow-sm"
                                        : "bg-white border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600"
                                )}
                            >
                                <Clock className="w-3 h-3" />
                                {min} phút
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Step 2: Script Editor ────────────────────────────────────────────────────

/** Nén ảnh base64 data URL → JPEG nhỏ hơn (resize + quality) */
function compressImage(dataUrl: string, maxW = 640, maxH = 480, quality = 0.6): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            let { width, height } = img;
            if (width > maxW) { height *= maxW / width; width = maxW; }
            if (height > maxH) { width *= maxH / height; height = maxH; }
            canvas.width = Math.round(width);
            canvas.height = Math.round(height);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataUrl); // fallback: trả ảnh gốc nếu lỗi
        img.src = dataUrl;
    });
}

function SlideImagePicker({
    section,
    onChange,
    onLoadingChange,
}: {
    section: ScriptSection;
    onChange: (imageDataUrl: string | undefined) => void;
    onLoadingChange?: (isLoading: boolean) => void;
}) {
    const [aiImage, setAiImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [lightbox, setLightbox] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const hasFetched = useRef(false); // guard: chỉ fetch 1 lần, tránh StrictMode double-fire

    // Auto-fetch ảnh khi lần đầu render (nếu chưa có custom)
    useEffect(() => {
        if (hasFetched.current) return;
        if (section.customImageBase64) {
            console.log(`[img] slide="${section.title}" → customImage already set, skip fetch`);
            return;
        }
        if (!section.imageKeyword && !section.title) {
            console.warn(`[img] slide="${section.title}" → no keyword/title, skip`);
            return;
        }

        hasFetched.current = true;
        setLoading(true);
        onLoadingChange?.(true);
        const keyword = section.imageKeyword || section.title;
        console.log(`[img] slide="${section.title}" → fetching, keyword="${keyword}"`);
        fetch("/api/video/preview-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                keyword: section.imageKeyword,
                title: section.title,
            }),
        })
            .then((r) => r.json())
            .then(async (d) => {
                if (d.success && d.imageDataUrl) {
                    const compressed = await compressImage(d.imageDataUrl, 640, 480, 0.6);
                    console.log(`[img] slide="${section.title}" → ✅ OK (${Math.round(d.imageDataUrl.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB)`);
                    setAiImage(compressed);
                    onChange(compressed);
                } else {
                    console.error(`[img] slide="${section.title}" → ❌ FAILED`, d.error ?? d);
                }
            })
            .catch((e) => console.error(`[img] slide="${section.title}" → ❌ EXCEPTION`, e))
            .finally(() => { setLoading(false); onLoadingChange?.(false); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const displayImage = section.customImageBase64 || aiImage;
    const isCustom = !!section.customImageBase64;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            const compressed = await compressImage(reader.result as string, 640, 480, 0.6);
            onChange(compressed);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="mt-3 border-t border-gray-100 pt-3">
            {/* Lightbox modal */}
            {lightbox && displayImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightbox(false)}
                >
                    <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setLightbox(false)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors z-10"
                        >
                            <X className="w-4 h-4 text-gray-700" />
                        </button>
                        <img
                            src={displayImage}
                            alt="slide preview"
                            className="w-full rounded-xl shadow-2xl"
                        />
                        <p className="text-center text-white/60 text-xs mt-2">
                            {isCustom ? "Ảnh của bạn" : `AI gen: "${(section.imageKeyword || section.title || "").slice(0, 60)}"`}
                        </p>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3">
                {/* Ảnh preview — click để mở lightbox */}
                <div
                    className={cn(
                        "relative w-[160px] h-[90px] flex-shrink-0 rounded-lg overflow-hidden border border-gray-200 bg-gray-50",
                        displayImage && !loading && "cursor-zoom-in hover:ring-2 hover:ring-brand-400 transition-all"
                    )}
                    onClick={() => displayImage && !loading && setLightbox(true)}
                    title={displayImage ? "Click để xem ảnh to" : ""}
                >
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        </div>
                    )}
                    {!loading && displayImage && (
                        <img src={displayImage} alt="slide preview" className="w-full h-full object-cover" />
                    )}
                    {!loading && !displayImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-300">
                            <ImageIcon className="w-6 h-6 mb-1" />
                            <span className="text-[10px]">Không có ảnh</span>
                        </div>
                    )}
                    {/* Badge AI / Custom */}
                    {displayImage && !loading && (
                        <span className={cn(
                            "absolute top-1 left-1 text-[9px] font-semibold px-1.5 py-0.5 rounded",
                            isCustom ? "bg-green-500 text-white" : "bg-blue-500 text-white"
                        )}>
                            {isCustom ? "Ảnh của bạn" : "AI"}
                        </span>
                    )}
                    {/* Zoom hint */}
                    {displayImage && !loading && (
                        <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center">
                            <span className="opacity-0 hover:opacity-100 text-white text-[10px] font-medium bg-black/50 px-2 py-0.5 rounded">
                                Xem to
                            </span>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] text-gray-400">
                        {isCustom
                            ? "Đang dùng ảnh của bạn"
                            : section.imageKeyword
                                ? `AI gen: "${section.imageKeyword.slice(0, 40)}"`
                                : "AI gen theo nội dung slide"}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => inputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600 hover:bg-blue-50 transition-all"
                        >
                            <Upload className="w-3 h-3" />
                            {isCustom ? "Thay ảnh khác" : "Dùng ảnh của bạn"}
                        </button>
                        {isCustom && (
                            <button
                                onClick={() => onChange(undefined)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                                <X className="w-3 h-3" />
                                Dùng lại ảnh AI
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
}


function StepScript({
    script,
    onUpdate,
    onImageLoadingChange,
}: {
    script: GeneratedScript;
    onUpdate: (updated: GeneratedScript) => void;
    onImageLoadingChange?: (loading: boolean) => void;
}) {
    const [imagesLoadingCount, setImagesLoadingCount] = useState(0);

    // Báo lên parent khi có slide đang load ảnh
    useEffect(() => {
        onImageLoadingChange?.(imagesLoadingCount > 0);
    }, [imagesLoadingCount, onImageLoadingChange]);

    const handleImageLoading = (isLoading: boolean) => {
        setImagesLoadingCount((c) => isLoading ? c + 1 : Math.max(0, c - 1));
    };

    // scriptRef luôn trỏ đến giá trị script mới nhất
    // → tránh stale closure khi 3 slides fetch song song và onChange gọi đồng thời
    const scriptRef = useRef(script);
    scriptRef.current = script;

    const updateSection = (idx: number, field: keyof ScriptSection, val: string) => {
        onUpdate({
            ...scriptRef.current,
            sections: scriptRef.current.sections.map((s, i) =>
                i === idx ? { ...s, [field]: val } : s
            ),
        });
    };

    const updateSectionImage = (idx: number, dataUrl: string | undefined) => {
        // Dùng scriptRef.current để tránh stale closure khi 3 slides load song song
        onUpdate({
            ...scriptRef.current,
            sections: scriptRef.current.sections.map((s, i) =>
                i === idx ? { ...s, customImageBase64: dataUrl } : s
            ),
        });
    };

    const addSection = () => {
        const newSection: ScriptSection = {
            index: script.sections.length,
            title: "",
            narration: "",
            slideContent: "",
            durationSeconds: 120,
            imageKeyword: "",
        };
        onUpdate({ ...script, sections: [...script.sections, newSection] });
    };

    const removeSection = (idx: number) => {
        if (script.sections.length <= 1) return;
        onUpdate({
            ...script,
            sections: script.sections
                .filter((_, i) => i !== idx)
                .map((s, i) => ({ ...s, index: i })),
        });
    };

    return (
        <div className="space-y-4">
            {/* Script header */}
            <div className="glass-card p-4 flex items-center gap-4">
                <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-1">Tiêu đề bài giảng</p>
                    <input
                        className="input-field text-lg font-semibold"
                        value={script.title}
                        onChange={(e) => onUpdate({ ...script, title: e.target.value })}
                    />
                </div>
                <div className="text-center px-4">
                    <p className="text-2xl font-bold text-brand-400">{script.sections.length}</p>
                    <p className="text-xs text-slate-500">phần</p>
                </div>
                <div className="text-center px-4">
                    <p className="text-2xl font-bold text-purple-400">{(script.totalWords ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-slate-500">từ</p>
                </div>
                <div className="text-center px-4">
                    <p className="text-2xl font-bold text-green-400">{script.estimatedDuration}</p>
                    <p className="text-xs text-slate-500">phút</p>
                </div>
            </div>

            {/* Sections */}
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                {script.sections.map((section, idx) => (
                    <div key={idx} className="glass-card overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center gap-3 p-4 border-b border-gray-100 bg-gray-50">
                            <span className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                {idx + 1}
                            </span>
                            <input
                                className="flex-1 bg-transparent text-gray-900 font-semibold focus:outline-none placeholder:text-gray-400"
                                placeholder="Nhập tiêu đề slide..."
                                value={section.title}
                                onChange={(e) => updateSection(idx, "title", e.target.value)}
                            />
                            {script.sections.length > 1 && (
                                <button
                                    onClick={() => removeSection(idx)}
                                    title="Xoá slide này"
                                    className="ml-1 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* 2 textarea */}
                        <div className="p-4 grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                                    <Edit3 className="w-3 h-3" /> Nội dung Voice-over (GV đọc)
                                </p>
                                <textarea
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 resize-none min-h-[120px] leading-relaxed"
                                    placeholder="Nhập nội dung giảng viên sẽ đọc..."
                                    value={section.narration}
                                    onChange={(e) => updateSection(idx, "narration", e.target.value)}
                                />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                                    <BookOpen className="w-3 h-3" /> Nội dung Slide (hiển thị)
                                </p>
                                <textarea
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-800
                             focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 resize-none min-h-[120px] font-mono leading-relaxed"
                                    placeholder={"• Ý chính 1\n• Ý chính 2\n• Ý chính 3"}
                                    value={section.slideContent}
                                    onChange={(e) => updateSection(idx, "slideContent", e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Image picker */}
                        <div className="px-4 pb-4">
                            <SlideImagePicker
                                section={section}
                                onChange={(url) => updateSectionImage(idx, url)}
                                onLoadingChange={handleImageLoading}
                            />
                        </div>
                    </div>
                ))}

                {/* Nút thêm slide */}
                <button
                    onClick={addSection}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-brand-600 hover:border-brand-300 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                    <Plus className="w-4 h-4" />
                    Thêm slide mới
                </button>
            </div>
        </div>
    );
}


// ─── Voice + Theme options ────────────────────────────────────────────────────
const VOICES = [
    // Edge TTS
    { id: "vi-VN-HoaiMyNeural", label: "Hoài My", sub: "Nữ · Miền Nam", badge: "Edge TTS", badgeColor: "bg-blue-700/60" },
    { id: "vi-VN-NamMinhNeural", label: "Nam Minh", sub: "Nam · Miền Bắc", badge: "Edge TTS", badgeColor: "bg-blue-700/60" },
    // ElevenLabs — giọng Việt
    { id: "el-vi-1", label: "Thảo", sub: "Nữ · Miền Bắc · Dịu dàng", badge: "ElevenLabs", badgeColor: "bg-violet-700/60" },
    { id: "el-vi-2", label: "Ninh Đôn", sub: "Nam · Miền Bắc · Trầm ấm", badge: "ElevenLabs", badgeColor: "bg-violet-700/60" },
    { id: "el-vi-3", label: "Hiện", sub: "Nam · Miền Nam · Phát thanh", badge: "ElevenLabs", badgeColor: "bg-violet-700/60" },
    { id: "el-vi-4", label: "Thắm", sub: "Nữ · Miền Bắc · Truyền cảm", badge: "ElevenLabs", badgeColor: "bg-violet-700/60" },
    { id: "el-vi-5", label: "Nhật", sub: "Nam · Miền Nam · Thuyết phục", badge: "ElevenLabs", badgeColor: "bg-violet-700/60" },
    // Google TTS
    { id: "gtts-vi", label: "Google TTS", sub: "Nữ · AI", badge: "Miễn phí", badgeColor: "bg-slate-700/60" },
];

const THEMES = [
    { id: "dark", label: "Dark", from: "#6366f1", to: "#1a1f2e" },
    { id: "ocean", label: "Ocean", from: "#06b6d4", to: "#0d1b2a" },
    { id: "midnight", label: "Midnight", from: "#7c3aed", to: "#0a0a0f" },
    { id: "forest", label: "Forest", from: "#10b981", to: "#0a1f0a" },
    { id: "sunset", label: "Sunset", from: "#f97316", to: "#1a0a0f" },
    { id: "light", label: "Light", from: "#4f46e5", to: "#f8fafc" },
];
const IMAGE_ENGINES = [
    {
        id: "gemini",
        label: "Gemini AI",
        sub: "Google · Nhanh · Miễn phí",
        badge: "Gemini",
        badgeColor: "bg-blue-600",
        emoji: "✨",
        desc: "Gen ảnh bằng Gemini 2.0 Flash — nhanh, phù hợp nội dung giáo dục",
    },
    {
        id: "stable-diffusion",
        label: "Stable Diffusion",
        sub: "Tự host · Chất lượng cao",
        badge: "SD",
        badgeColor: "bg-orange-600",
        emoji: "🎨",
        desc: "AUTOMATIC1111 / ComfyUI tự host — chi tiết hơn, cần GPU server",
    },
];


// ─── Step 3: Tier + Voice + Theme Selector ────────────────────────────────────
function StepTier({
    selectedTier, durationMinutes, voiceId, slideTheme, imageEngine,
    instructorPhoto, avatarIntro, subtitle,
    onSelect, onVoice, onTheme, onImageEngine, onInstructorPhoto, onAvatarIntro, onSubtitle,
}: {
    selectedTier: number; durationMinutes: number;
    voiceId: string; slideTheme: string; imageEngine: string;
    instructorPhoto: string; avatarIntro: string; subtitle: boolean;
    onSelect: (t: number) => void;
    onVoice: (v: string) => void;
    onTheme: (t: string) => void;
    onImageEngine: (e: string) => void;
    onInstructorPhoto: (b64: string) => void;
    onAvatarIntro: (text: string) => void;
    onSubtitle: (s: boolean) => void;
}) {
    return (
        <div className="space-y-6">
            <p className="text-gray-500 text-sm">
                Chọn kiểu video phù hợp. Có thể kết hợp nhiều tier cho các phần khác nhau của khóa học.
            </p>
            <div className="grid grid-cols-1 gap-4">
                {TIERS.map((tier) => (
                    <button
                        key={tier.id}
                        onClick={() => onSelect(tier.id)}
                        className={cn("tier-card text-left relative", selectedTier === tier.id && "selected")}
                    >
                        {tier.recommended && (
                            <span className="absolute top-4 right-4 text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full font-medium">
                                Khuyến nghị
                            </span>
                        )}
                        <div className="flex items-start gap-4">
                            <span className="text-2xl">{tier.emoji}</span>
                            <div className="flex-1">
                                <p className="font-semibold text-gray-900 mb-1">{tier.name}</p>
                                <p className="text-sm text-gray-500 mb-3">{tier.desc}</p>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {tier.pros.map((p) => (
                                        <span key={p} className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ {p}</span>
                                    ))}
                                    {tier.cons.map((c) => (
                                        <span key={c} className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">• {c}</span>
                                    ))}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-400">
                                    <span>🔧 {tier.tech}</span>
                                    <span>📍 {tier.bestFor}</span>

                                </div>
                            </div>
                        </div>
                        {selectedTier === tier.id && (
                            <div className="absolute inset-0 rounded-2xl border-2 border-brand-500 pointer-events-none" />
                        )}
                    </button>
                ))}
            </div>

            {/* Voice Picker — Tier 1 & 2 */}
            <div className="glass-card p-5 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">🎤 Chọn giọng đọc</p>
                    <div className="grid grid-cols-3 gap-2">
                        {VOICES.map((v) => (
                            <button key={v.id} onClick={() => onVoice(v.id)}
                                className={cn(
                                    "p-2.5 rounded-xl border text-left transition-all bg-white",
                                    voiceId === v.id
                                        ? "bg-brand-50 border-brand-500 shadow-sm"
                                        : "border-gray-200 hover:border-brand-300"
                                )}>
                                <p className="font-semibold text-xs text-gray-900 leading-tight">{v.label}</p>
                                <p className="text-[11px] text-gray-500 mt-0.5">{v.sub}</p>
                                <span className="text-[10px] mt-1 inline-block rounded px-1.5 py-0.5 bg-brand-100 text-brand-700 font-medium">{v.badge}</span>
                            </button>
                        ))}
                    </div>
                </div>
            <div className="glass-card p-5 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">🎨 Chọn theme màu slide</p>
                    <div className="grid grid-cols-6 gap-2">
                        {THEMES.map((t) => (
                            <button key={t.id} onClick={() => onTheme(t.id)} title={t.label}
                                className={cn(
                                    "rounded-xl overflow-hidden border-2 transition-all",
                                    slideTheme === t.id
                                        ? "border-brand-400 scale-105 shadow-lg shadow-brand-500/20"
                                        : "border-transparent hover:border-slate-600"
                                )}>
                                <div className="h-14 w-full flex items-center justify-center"
                                    style={{ background: `linear-gradient(135deg, ${t.to}, ${t.from})` }}>
                                    <span className="text-white text-[11px] font-bold drop-shadow">{t.label}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

            {/* Tier 1: Instructor photo + Avatar intro text */}

            {selectedTier === 1 && (
                <div className="glass-card p-5 space-y-4">
                    <p className="text-sm font-semibold text-gray-900">👤 Thiết lập Avatar Giảng Viên</p>

                    {/* Ảnh GV */}
                    <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-600">Ảnh giảng viên <span className="text-gray-400">(mặt rõ, hướng thẳng, nền đơn)</span></p>
                        <div className="flex items-center gap-3">
                            {instructorPhoto ? (
                                <div className="relative">
                                    <img src={instructorPhoto} alt="instructor" className="w-16 h-16 rounded-full object-cover border-2 border-brand-400" />
                                    <button onClick={() => onInstructorPhoto("")}
                                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">×</button>
                                </div>
                            ) : (
                                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-400 text-sm text-gray-500 hover:text-brand-600 transition-all">
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        const reader = new FileReader();
                                        reader.onload = () => onInstructorPhoto(reader.result as string);
                                        reader.readAsDataURL(f);
                                    }} />
                                    + Upload ảnh GV
                                </label>
                            )}
                            {instructorPhoto && <span className="text-xs text-green-600">✅ Sẵn sàng</span>}
                        </div>
                    </div>

                    {/* Avatar intro text */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-gray-600">Nội dung avatar sẽ nói <span className="text-gray-400">(= toàn bộ slide 1)</span></p>
                            <span className="text-[11px] font-medium text-gray-400">{avatarIntro.length} ký tự</span>
                        </div>
                        <textarea
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none min-h-[120px] leading-relaxed"
                            placeholder="Nhập nội dung avatar sẽ nói trong phần intro..."
                            value={avatarIntro}
                            onChange={(e) => onAvatarIntro(e.target.value)}
                        />
                        <p className="text-[11px] text-gray-400">💡 Avatar nói toàn bộ nội dung này (= narration slide 1). Sau đó avatar biến mất, slide tiếp tục.</p>
                    </div>
                </div>
            )}

            {/* ── Subtitle Toggle ─────────────────────────────────────────── */}
            <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-100">
                <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => onSubtitle(!subtitle)}
                >
                    <div>
                        <p className="text-sm font-medium text-gray-700">📝 Phụ đề tự động (Subtitle)</p>
                        <p className="text-xs text-gray-400 mt-0.5">Burn phụ đề tiếng Việt vào video từ nội dung narration</p>
                    </div>
                    <div className={`relative w-11 h-6 rounded-full transition-colors ${subtitle ? 'bg-brand-500' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${subtitle ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Step 4: Confirm ──────────────────────────────────────────────────────────
function StepConfirm({
    form,
    script,
    tier,
}: {
    form: { subject: string; durationMinutes: number };
    script: GeneratedScript;
    tier: number;
}) {
    const selectedTier = TIERS.find((t) => t.id === tier)!;
    return (
        <div className="space-y-5">
            <div className="glass-card p-5 space-y-3">
                <h3 className="font-semibold text-gray-900 text-lg">{script.title}</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                        <p className="text-gray-400">Môn học</p>
                        <p className="text-gray-900 font-medium">{form.subject}</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Thời lượng</p>
                        <p className="text-gray-900 font-medium">{form.durationMinutes} phút</p>
                    </div>
                    <div>
                        <p className="text-gray-400">Số phần</p>
                        <p className="text-gray-900 font-medium">{script.sections.length} sections</p>
                    </div>
                </div>
            </div>

            <div className="glass-card p-5">
                <p className="text-gray-400 text-sm mb-2">Kiểu video đã chọn</p>
                <p className="text-gray-900 font-semibold text-lg">
                    {selectedTier.emoji} {selectedTier.name}
                </p>
                <p className="text-gray-500 text-sm">{selectedTier.desc}</p>

            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-blue-700">
                    Sau khi xác nhận, hệ thống sẽ bắt đầu render video.
                    Bạn có thể theo dõi tiến trình realtime trên trang video.
                </p>
            </div>
        </div>
    );
}

// ─── Main Wizard Page ─────────────────────────────────────────────────────────
export default function NewVideoPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [form, setForm] = useState({
        subject: "",
        outline: "",
        durationMinutes: 5,
        rawContent: "",
    });
    const [uploadedFile, setUploadedFile] = useState<File | null>(null); // File gốc từ upload
    const [instructorPhoto, setInstructorPhoto] = useState<string>(""); // base64 data URL cho Tier 1
    const [script, setScript] = useState<GeneratedScript | null>(null);
    const [selectedTier, setSelectedTier] = useState(2);
    const [voiceId, setVoiceId] = useState("vi-VN-HoaiMyNeural");
    const [slideTheme, setSlideTheme] = useState("dark");
    const [imageEngine, setImageEngine] = useState("gemini");
    const [avatarIntro, setAvatarIntro] = useState("");
    const [imagesLoading, setImagesLoading] = useState(false);
    const [subtitle, setSubtitle] = useState(true);

    const updateForm = (k: string, v: string | number) =>
        setForm((p) => ({ ...p, [k]: v }));

    const handleGenerateScript = async () => {
        // Nếu có file upload → dùng API mới gửi file nguyên vẹn lên Gemini
        if (uploadedFile) {
            setLoading(true);
            try {
                const fd = new FormData();
                fd.append("file", uploadedFile);
                fd.append("durationMinutes", String(form.durationMinutes));
                const res = await fetch("/api/video/generate-script-from-file", {
                    method: "POST",
                    body: fd,
                });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);
                // Lấy subject từ title nếu chưa có
                if (!form.subject.trim()) updateForm("subject", data.script.title);
                setScript(data.script);
                setStep(2);
                toast.success("Đã trích xuất tài liệu và sinh script!");
            } catch (e: unknown) {
                toast.error((e as Error).message || "Lỗi sinh script từ file");
            } finally {
                setLoading(false);
            }
            return;
        }

        // Nhập tay → API cũ
        if (!form.subject.trim() || !form.outline.trim()) {
            toast.error("Vui lòng nhập đầy đủ Môn học và Outline!");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch("/api/video/generate-script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            setScript(data.script);
            setStep(2);
            toast.success("Script đã được sinh! Hãy review và chỉnh sửa.");
        } catch (e: unknown) {
            toast.error((e as Error).message || "Lỗi sinh script");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!script || submitting) return;  // Guard: chặn bấm nhiều lần
        setSubmitting(true);
        try {
            // Script lưu DB: bỏ customImageBase64 để tránh vượt Next.js 1MB body limit
            const scriptForDB = {
                ...script,
                sections: script.sections.map(({ customImageBase64: _, ...s }) => s),
            };

            // 1. Save job to DB (không có ảnh)
            const res = await fetch("/api/video/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instructorId: (session?.user as { id?: string })?.id || "unknown",
                    title: script.title,
                    subject: form.subject,
                    outline: form.outline,
                    durationMinutes: form.durationMinutes,
                    tier: selectedTier,
                    voiceId,
                    slideTheme,
                    generatedScript: scriptForDB,
                    approvedScript: { ...scriptForDB, imageEngine },
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            const jobId = data.job.id;

            // 2. Trigger worker — script_override có đầy đủ customImageBase64
            fetch("/api/video/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobId,
                    tier: selectedTier,
                    // Truyền script có ảnh xuống worker (ảnh đã nén JPEG ở preview)
                    script_override: {
                        ...script,
                        imageEngine,
                    },
                    // Tier 1 SadTalker: gửi ảnh GV (base64 strip prefix) và avatar intro text
                    instructor_photo_base64: selectedTier === 1 && instructorPhoto
                        ? instructorPhoto.replace(/^data:[^;]+;base64,/, "")
                        : undefined,
                    avatar_intro: selectedTier === 1
                        ? (avatarIntro || (script?.sections[0]?.narration || ""))
                        : undefined,
                    subtitle,
                }),
            }).catch(() => { });

            toast.success("Video đang được tạo!");
            router.push(`/dashboard/videos/${jobId}`);
        } catch (e: unknown) {
            toast.error((e as Error).message || "Lỗi tạo video");
        } finally {
            setSubmitting(false);
        }
    };

    const canProceed = () => {
        if (step === 1) return !!uploadedFile || (form.subject.trim().length > 0 && form.outline.trim().length > 0);
        if (step === 2) return script !== null && !imagesLoading;
        return true;
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Tạo video bài giảng mới</h1>
                <p className="text-gray-500 mt-1">
                    Nhập outline hoặc upload tài liệu, AI sẽ sinh script và tạo video chuyên nghiệp.
                </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-8">
                {STEPS.map((s, idx) => {
                    const Icon = s.icon;
                    const active = step === s.id;
                    const done = step > s.id;
                    return (
                        <div key={s.id} className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        "step-indicator",
                                        done
                                            ? "bg-green-100 text-green-700 border border-green-300"
                                            : active
                                                ? "bg-brand-600 text-white border border-brand-700"
                                                : "bg-white text-gray-400 border border-gray-200"
                                    )}
                                >
                                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                </div>
                                <span
                                    className={cn(
                                        "text-sm font-medium hidden sm:block",
                                        active ? "text-brand-700 font-semibold" : done ? "text-green-700" : "text-gray-400"
                                    )}
                                >
                                    {s.label}
                                </span>
                            </div>
                            {idx < STEPS.length - 1 && (
                                <div className={cn("h-px w-12 mx-2", step > s.id ? "bg-green-500/40" : "bg-surface-border")} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step content */}
            <div className="glass-card p-6 mb-6">
                {step === 1 && <StepInput form={form} onChange={updateForm} selectedFile={uploadedFile} onFileSelect={setUploadedFile} />}
                {step === 2 && script && (
                    <StepScript
                        script={script}
                        onUpdate={setScript}
                        onImageLoadingChange={setImagesLoading}
                    />
                )}
                {step === 3 && (
                    <StepTier
                        selectedTier={selectedTier}
                        durationMinutes={form.durationMinutes}
                        voiceId={voiceId}
                        slideTheme={slideTheme}
                        imageEngine={imageEngine}
                        instructorPhoto={instructorPhoto}
                        avatarIntro={avatarIntro || (script?.sections[0]?.narration || "")}
                        subtitle={subtitle}
                        onSelect={setSelectedTier}
                        onVoice={setVoiceId}
                        onTheme={setSlideTheme}
                        onImageEngine={setImageEngine}
                        onInstructorPhoto={setInstructorPhoto}
                        onAvatarIntro={setAvatarIntro}
                        onSubtitle={setSubtitle}
                    />
                )}
                {step === 4 && script && (
                    <StepConfirm form={form} script={script} tier={selectedTier} />
                )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => (step === 1 ? router.back() : setStep((s) => s - 1))}
                    className="btn-secondary flex items-center gap-2"
                    disabled={loading}
                >
                    <ChevronLeft className="w-4 h-4" />
                    {step === 1 ? "Huỷ" : "Quay lại"}
                </button>

                {step === 1 ? (
                    <button
                        onClick={handleGenerateScript}
                        disabled={!canProceed() || loading}
                        className="btn-primary flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Đang sinh script...
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-4 h-4" />
                                Sinh Script với AI
                            </>
                        )}
                    </button>
                ) : step === 4 ? (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="btn-primary flex items-center gap-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Đang tạo...
                            </>
                        ) : (
                            <>
                                <Rocket className="w-4 h-4" />
                                Bắt đầu tạo video!
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        onClick={() => setStep((s) => s + 1)}
                        disabled={!canProceed()}
                        className="btn-primary flex items-center gap-2"
                    >
                        Tiếp theo
                        <ChevronRight className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

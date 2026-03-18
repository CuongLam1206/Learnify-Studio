"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft, Play, Download, Loader2, CheckCircle2,
    XCircle, Clock, Video, DollarSign, FileText, ChevronDown, ChevronUp, Subtitles
} from "lucide-react";
import {
    getStatusColor, getStatusLabel, getTierLabel,
    formatDuration, formatCost, formatFileSize
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import QuizPanel from "@/components/QuizPanel";

type ScriptSection = {
    index: number; title: string; narration: string; slideContent: string; durationSeconds: number;
};
type Job = {
    id: string; title: string; subject: string; status: string; tier: number;
    durationMinutes: number; approvedScript: { title: string; sections: ScriptSection[] } | null;
    outputUrl: string | null; thumbnailUrl: string | null;
    durationSeconds: number | null; fileSizeMb: number | null;
    costUsd: number | null; progress: number; errorMessage: string | null;
    createdAt: string; instructor: { name: string };
    quizData: { question: string; options: string[]; answer: number; explanation: string }[] | null;
};

export default function JobDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<"video" | "quiz">("video");
    const eventSourceRef = useRef<EventSource | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [ccEnabled, setCcEnabled] = useState(false);

    useEffect(() => {
        fetch(`/api/video/jobs/${id}`)
            .then((r) => r.json())
            .then((d) => { if (d.success) setJob(d.job); })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        if (!job) return;
        if (job.status === "done") return;

        const pollInterval = setInterval(() => {
            fetch(`/api/video/jobs/${id}`)
                .then((r) => r.json())
                .then((d) => {
                    if (d.success) {
                        setJob(d.job);
                        if (d.job.status === "done") clearInterval(pollInterval);
                    }
                });
        }, 3000);

        if (job.status === "processing" || job.status === "approved") {
            const es = new EventSource(`/api/video/jobs/${id}/progress`);
            eventSourceRef.current = es;
            es.onmessage = (event) => {
                const data = JSON.parse(event.data);
                setJob((prev) => prev ? { ...prev, ...data } : prev);
                if (data.status === "done" || data.status === "failed") es.close();
            };
        }

        return () => {
            clearInterval(pollInterval);
            eventSourceRef.current?.close();
        };
    }, [job?.status, id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
        );
    }

    if (!job) {
        return (
            <div className="text-center py-16">
                <p className="text-gray-500">Không tìm thấy video này.</p>
                <Link href="/dashboard/videos" className="btn-secondary mt-4 inline-block">← Quay lại</Link>
            </div>
        );
    }

    const isProcessing = job.status === "processing" || job.status === "approved";

    return (
        <div className="max-w-5xl mx-auto animate-fade-in space-y-6">
            {/* Top bar */}
            <div className="flex items-center gap-4">
                <button onClick={() => router.back()} className="btn-ghost flex items-center gap-2 text-sm">
                    <ArrowLeft className="w-4 h-4" /> Quay lại
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
                    <p className="text-gray-500 text-sm">{job.subject}</p>
                </div>
                <span className={`status-badge text-sm px-4 py-1.5 ${getStatusColor(job.status)}`}>
                    {getStatusLabel(job.status)}
                </span>
            </div>

            {/* Tab switcher */}
            {job.status === "done" && (
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    {(["video", "quiz"] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn(
                                "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all",
                                activeTab === tab
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {tab === "video" ? "🎬 Video & Script" : "📝 Câu hỏi ôn tập"}
                        </button>
                    ))}
                </div>
            )}

            {activeTab === "video" ? (
                <div className="grid grid-cols-3 gap-6">
                    {/* Left — Video Player / Progress */}
                    <div className="col-span-2 space-y-4">
                        {job.status === "done" && job.outputUrl ? (
                            <div className="glass-card overflow-hidden">
                                <video
                                    ref={videoRef}
                                    src={job.outputUrl}
                                    controls
                                    crossOrigin="anonymous"
                                    className="w-full rounded-2xl aspect-video bg-black"
                                >
                                    <track
                                        kind="subtitles"
                                        src={job.outputUrl.replace(".mp4", ".vtt")}
                                        srcLang="vi"
                                        label="Tiếng Việt"
                                    />
                                </video>
                                <div className="p-4 flex gap-3">
                                    <a href={job.outputUrl} download className="btn-primary flex items-center gap-2">
                                        <Download className="w-4 h-4" /> Tải xuống
                                    </a>
                                    <button
                                        onClick={() => {
                                            const video = videoRef.current;
                                            if (video && video.textTracks.length > 0) {
                                                const track = video.textTracks[0];
                                                const newMode = track.mode === "showing" ? "hidden" : "showing";
                                                track.mode = newMode;
                                                setCcEnabled(newMode === "showing");
                                            }
                                        }}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${ccEnabled
                                            ? "bg-brand-50 text-brand-700 border-brand-300"
                                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                                            }`}
                                    >
                                        <Subtitles className="w-4 h-4" />
                                        {ccEnabled ? "Tắt phụ đề" : "Bật phụ đề"}
                                    </button>
                                </div>
                            </div>
                        ) : isProcessing ? (
                            <div className="glass-card p-8 text-center">
                                <div className="relative w-20 h-20 mx-auto mb-6">
                                    <div className="absolute inset-0 rounded-full border-4 border-gray-200" />
                                    <div
                                        className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"
                                        style={{ animationDuration: "1.5s" }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-sm font-bold text-brand-600">{job.progress}%</span>
                                    </div>
                                </div>

                                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                                    <div
                                        className="h-2 bg-gradient-brand rounded-full transition-all duration-1000"
                                        style={{ width: `${job.progress}%` }}
                                    />
                                </div>

                                <p className="text-gray-900 font-semibold mb-2">Đang render video...</p>
                                <p className="text-gray-500 text-sm mb-1">
                                    {getTierLabel(job.tier)} · Tier {job.tier} Pipeline
                                </p>
                                <p className="text-gray-400 text-xs">
                                    {job.tier === 1
                                        ? "Đang xử lý qua HeyGen Avatar AI, ước tính 5–15 phút..."
                                        : job.tier === 2
                                            ? "Đang gen ảnh AI (Gemini) + gTTS voice + ghép video FFmpeg..."
                                            : "Đang tạo animation..."}
                                </p>
                            </div>
                        ) : job.status === "failed" ? (
                            <div className="glass-card p-8 text-center">
                                <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                                <p className="text-red-600 font-semibold mb-2">Tạo video thất bại</p>
                                <p className="text-gray-500 text-sm">{job.errorMessage || "Lỗi không xác định"}</p>
                                <Link href="/dashboard/videos/new" className="btn-secondary mt-4 inline-flex items-center gap-2">
                                    Thử lại với bài giảng mới
                                </Link>
                            </div>
                        ) : (
                            <div className="glass-card p-8 text-center">
                                <Video className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <p className="text-gray-500">
                                    Video chưa được xử lý.
                                    {job.status === "script_generated" && " Script đã sinh — hãy xác nhận để bắt đầu render."}
                                </p>
                            </div>
                        )}

                        {/* Script preview */}
                        {job.approvedScript && (
                            <div className="glass-card overflow-hidden">
                                <div className="p-4 border-b border-gray-200 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-brand-500" />
                                    <span className="font-medium text-gray-900">Script bài giảng</span>
                                    <span className="text-gray-400 text-sm ml-auto">
                                        {job.approvedScript.sections.length} phần
                                    </span>
                                </div>
                                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                                    {job.approvedScript.sections.map((section, idx) => (
                                        <div key={idx}>
                                            <button
                                                onClick={() => setExpandedSection(expandedSection === idx ? null : idx)}
                                                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                                            >
                                                {/* Number circle — solid blue, text white */}
                                                <span className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center text-xs text-white font-semibold flex-shrink-0">
                                                    {idx + 1}
                                                </span>
                                                <span className="flex-1 text-sm font-medium text-gray-800">{section.title}</span>
                                                {/* ~Xp bị ẩn vì Gemini không tính đúng per section */}
                                                {expandedSection === idx
                                                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                            </button>
                                            {expandedSection === idx && (
                                                <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                        <p className="text-xs text-gray-400 mb-1 font-medium">Voice-over</p>
                                                        <p className="text-xs text-gray-700 leading-relaxed line-clamp-6">{section.narration}</p>
                                                    </div>
                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 font-mono">
                                                        <p className="text-xs text-gray-400 mb-1 font-medium">Nội dung Slide</p>
                                                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{section.slideContent}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right — Info panel */}
                    <div className="space-y-4">
                        {/* Meta */}
                        <div className="glass-card p-5 space-y-4">
                            <h3 className="font-semibold text-gray-900">Thông tin video</h3>
                            {[
                                { icon: Play, label: "Kiểu", value: getTierLabel(job.tier) },
                                { icon: Clock, label: "Thời lượng input", value: `${job.durationMinutes} phút` },
                                ...(job.durationSeconds
                                    ? [{ icon: Clock, label: "Thời lượng thực", value: formatDuration(job.durationSeconds) }]
                                    : []),
                                ...(job.fileSizeMb
                                    ? [{ icon: Video, label: "Kích thước", value: formatFileSize(job.fileSizeMb) }]
                                    : []),
                                ...(job.costUsd != null
                                    ? [{ icon: DollarSign, label: "Chi phí", value: formatCost(job.costUsd) }]
                                    : []),
                            ].map(({ icon: Icon, label, value }) => (
                                <div key={label} className="flex items-center gap-3">
                                    <div className="p-1.5 bg-gray-100 rounded-lg">
                                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400">{label}</p>
                                        <p className="text-sm text-gray-900 font-medium">{value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Status timeline */}
                        <div className="glass-card p-5">
                            <h3 className="font-semibold text-gray-900 mb-4">Trạng thái</h3>
                            <div className="space-y-3">
                                {[
                                    { s: "draft", label: "Bản nháp tạo" },
                                    { s: "script_generated", label: "Script đã sinh" },
                                    { s: "approved", label: "Script đã duyệt" },
                                    { s: "processing", label: "Đang xử lý" },
                                    { s: "done", label: "Hoàn thành" },
                                ].map(({ s, label }, idx) => {
                                    const statuses = ["draft", "script_generated", "approved", "processing", "done"];
                                    const currentIdx = statuses.indexOf(job.status);
                                    const done = currentIdx > idx;
                                    const active = currentIdx === idx;
                                    return (
                                        <div key={s} className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-semibold",
                                                done ? "bg-green-100 text-green-700"
                                                    : active ? "bg-brand-600 text-white"
                                                        : "bg-gray-100 text-gray-400"
                                            )}>
                                                {done ? <CheckCircle2 className="w-3 h-3" /> : <span>{idx + 1}</span>}
                                            </div>
                                            <span className={cn(
                                                "text-sm",
                                                done ? "text-green-700 font-medium"
                                                    : active ? "text-brand-700 font-semibold"
                                                        : "text-gray-400"
                                            )}>{label}</span>
                                        </div>
                                    );
                                })}

                                {job.status === "failed" && (
                                    <div className="flex items-center gap-3">
                                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                        <span className="text-sm text-red-600 font-medium">Thất bại</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass-card p-6">
                    <QuizPanel jobId={job.id} initialQuiz={job.quizData} />
                </div>
            )
            }
        </div>
    );
}

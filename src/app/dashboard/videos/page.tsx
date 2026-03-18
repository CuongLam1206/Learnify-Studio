"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Video, Plus, Search, Filter, Trash2 } from "lucide-react";
import {
    getStatusColor,
    getStatusLabel,
    getTierLabel,
    formatDuration,
    formatCost,
} from "@/lib/utils";
import { cn } from "@/lib/utils";

type Job = {
    id: string;
    title: string;
    subject: string;
    status: string;
    tier: number;
    durationSeconds: number | null;
    costUsd: number | null;
    createdAt: string;
    thumbnailUrl: string | null;
    outputUrl: string | null;
    instructor: { name: string };
};

export default function VideosPage() {
    const { data: session } = useSession();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (!session?.user) return;
        const user = session.user as { id?: string; role?: string };
        // Admin thấy tất cả video, teacher chỉ thấy video của mình
        const url = user.role === "admin"
            ? "/api/video/jobs"
            : `/api/video/jobs?instructorId=${user.id}`;
        fetch(url)
            .then((r) => r.json())
            .then((d) => { if (d.success) setJobs(d.jobs); })
            .finally(() => setLoading(false));
    }, [session]);

    const handleDelete = async (e: React.MouseEvent, jobId: string, title: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm(`Xóa video "${title}"?\n\nHành động này không thể hoàn tác.`)) return;
        setDeletingId(jobId);
        try {
            const res = await fetch(`/api/video/jobs/${jobId}`, { method: "DELETE" });
            if (res.ok) {
                setJobs((prev) => prev.filter((j) => j.id !== jobId));
            } else {
                alert("Xóa thất bại. Vui lòng thử lại.");
            }
        } finally {
            setDeletingId(null);
        }
    };

    const filtered = jobs.filter((j) => {
        const matchSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
            j.subject.toLowerCase().includes(search.toLowerCase());
        const matchStatus = filterStatus === "all" || j.status === filterStatus;
        return matchSearch && matchStatus;
    });

    const STATUSES = ["all", "draft", "script_generated", "approved", "processing", "done", "failed"];

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Video bài giảng</h1>
                    <p className="text-gray-500 mt-1">{jobs.length} video trong thư viện</p>
                </div>
                <Link href="/dashboard/videos/new" className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Tạo video mới
                </Link>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        className="input-field pl-10"
                        placeholder="Tìm kiếm theo tên, môn học..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    {STATUSES.map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                filterStatus === s
                                    ? "bg-brand-50 border-brand-400 text-brand-700"
                                    : "border-surface-border text-gray-500 hover:border-gray-400 bg-white"
                            )}
                        >
                            {s === "all" ? "Tất cả" : getStatusLabel(s)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="glass-card p-5 h-40 animate-pulse bg-surface-card" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="glass-card p-16 text-center">
                    <Video className="w-14 h-14 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400 text-lg mb-4">
                        {search || filterStatus !== "all" ? "Không tìm thấy video phù hợp" : "Chưa có video nào"}
                    </p>
                    <Link href="/dashboard/videos/new" className="btn-primary inline-flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Tạo video đầu tiên
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((job) => (
                        <div key={job.id} className="relative group">
                            <Link
                                href={`/dashboard/videos/${job.id}`}
                                className="glass-card p-5 hover:border-brand-500/40 hover:glow-sm transition-all block"
                            >
                                {/* Thumbnail */}
                                <div className="w-full h-36 rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center relative">
                                    {job.thumbnailUrl ? (
                                        <img
                                            src={job.thumbnailUrl}
                                            alt={job.title}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <>
                                            <Video className="w-10 h-10 text-brand-300" />
                                            {/* Play overlay khi hover nếu video done */}
                                            {job.status === "done" && (
                                                <div className="absolute inset-0 bg-brand-600/0 group-hover:bg-brand-600/10 flex items-center justify-center transition-all">
                                                    <div className="w-10 h-10 rounded-full bg-brand-600/0 group-hover:bg-brand-600 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100">
                                                        <Video className="w-5 h-5 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <p className="font-semibold text-gray-900 leading-tight line-clamp-2">{job.title}</p>
                                    <p className="text-sm text-gray-500">{job.subject}</p>

                                    <div className="flex items-center justify-between pt-1">
                                        <span className={`status-badge ${getStatusColor(job.status)}`}>
                                            {getStatusLabel(job.status)}
                                        </span>
                                        <span className="text-xs text-slate-500">{getTierLabel(job.tier).split(" — ")[0]}</span>
                                    </div>

                                    <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                                        {job.durationSeconds && <span>⏱ {formatDuration(job.durationSeconds)}</span>}
                                        {job.costUsd != null && <span>💰 {formatCost(job.costUsd)}</span>}
                                        <span className="ml-auto">{new Date(job.createdAt).toLocaleDateString("vi-VN")}</span>
                                    </div>
                                </div>
                            </Link>

                            {/* Nút Xóa — hiện khi hover card */}
                            <button
                                onClick={(e) => handleDelete(e, job.id, job.title)}
                                disabled={deletingId === job.id}
                                className={cn(
                                    "absolute top-3 right-3 p-1.5 rounded-lg transition-all z-10",
                                    "bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 hover:border-red-500/50",
                                    "text-red-400 hover:text-red-300",
                                    "opacity-0 group-hover:opacity-100",
                                    deletingId === job.id && "opacity-100 animate-pulse"
                                )}
                                title="Xóa video"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

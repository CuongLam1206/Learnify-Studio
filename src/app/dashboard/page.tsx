"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Video, Plus, TrendingUp, Clock, DollarSign, Film } from "lucide-react";
import { getStatusColor, getStatusLabel, getTierLabel, formatDuration, formatCost } from "@/lib/utils";

type Job = {
    id: string;
    title: string;
    subject: string;
    status: string;
    tier: number;
    durationSeconds: number | null;
    costUsd: number | null;
    createdAt: string;
};

export default function DashboardPage() {
    const { data: session } = useSession();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!session?.user) return;
        const user = session.user as { id?: string; role?: string };
        const url = user.role === "admin"
            ? "/api/video/jobs"
            : `/api/video/jobs?instructorId=${user.id}`;
        fetch(url)
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setJobs(d.jobs);
            })
            .finally(() => setLoading(false));
    }, [session]);

    const stats = {
        total: jobs.length,
        done: jobs.filter((j) => j.status === "done").length,
        processing: jobs.filter((j) => j.status === "processing").length,
        totalCost: jobs.reduce((sum, j) => sum + (j.costUsd ?? 0), 0),
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Tổng quan</h1>
                    <p className="text-gray-500 mt-1">
                        Xin chào! Đây là hệ thống tạo video bài giảng AI của bạn.
                    </p>
                </div>
                <Link href="/dashboard/videos/new" className="btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Tạo video mới
                </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    {
                        label: "Tổng video",
                        value: loading ? "—" : stats.total,
                        icon: Film,
                        iconClass: "text-blue-600",
                        bgClass: "bg-blue-50",
                        valueClass: "text-blue-700",
                    },
                    {
                        label: "Hoàn thành",
                        value: loading ? "—" : stats.done,
                        icon: Video,
                        iconClass: "text-green-600",
                        bgClass: "bg-green-50",
                        valueClass: "text-green-700",
                    },
                    {
                        label: "Đang xử lý",
                        value: loading ? "—" : stats.processing,
                        icon: Clock,
                        iconClass: "text-yellow-600",
                        bgClass: "bg-yellow-50",
                        valueClass: "text-yellow-700",
                    },
                    {
                        label: "Chi phí tháng",
                        value: loading ? "—" : formatCost(stats.totalCost),
                        icon: DollarSign,
                        iconClass: "text-purple-600",
                        bgClass: "bg-purple-50",
                        valueClass: "text-purple-700",
                    },
                ].map(({ label, value, icon: Icon, iconClass, bgClass, valueClass }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-gray-500 font-medium">{label}</p>
                            <div className={`p-2 rounded-xl ${bgClass}`}>
                                <Icon className={`w-4 h-4 ${iconClass}`} />
                            </div>
                        </div>
                        <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
                    </div>
                ))}
            </div>


            {/* Recent jobs */}
            <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-surface-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-brand-400" />
                        Video gần đây
                    </h2>
                    <Link href="/dashboard/videos" className="btn-ghost text-sm">
                        Xem tất cả →
                    </Link>
                </div>

                {loading ? (
                    <div className="p-8 text-center text-slate-500">Đang tải...</div>
                ) : jobs.length === 0 ? (
                    <div className="p-12 text-center">
                        <Video className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400 mb-4">Chưa có video nào.</p>
                        <Link href="/dashboard/videos/new" className="btn-primary inline-flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Tạo video đầu tiên
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-surface-border">
                        {jobs.slice(0, 5).map((job) => (
                            <Link
                                key={job.id}
                                href={`/dashboard/videos/${job.id}`}
                                className="flex items-center gap-4 p-4 hover:bg-white/3 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-lg bg-brand-600/20 flex items-center justify-center flex-shrink-0">
                                    <Video className="w-5 h-5 text-brand-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{job.title}</p>
                                    <p className="text-sm text-gray-500 truncate">
                                        {job.subject} · {getTierLabel(job.tier)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-400">
                                    {job.durationSeconds && (
                                        <span>{formatDuration(job.durationSeconds)}</span>
                                    )}
                                    {job.costUsd != null && (
                                        <span>{formatCost(job.costUsd)}</span>
                                    )}
                                    <span className={`status-badge ${getStatusColor(job.status)}`}>
                                        {getStatusLabel(job.status)}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

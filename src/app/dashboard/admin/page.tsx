"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Building2, Video, TrendingUp, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { getStatusColor, getStatusLabel, getTierLabel } from "@/lib/utils";

type Member = {
    id: string;
    name: string;
    email: string;
    role: string;
    _count: { videoJobs: number };
};

type MemberVideo = {
    id: string;
    title: string;
    subject: string;
    status: string;
    tier: number;
    createdAt: string;
};

export default function AdminPage() {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [memberVideos, setMemberVideos] = useState<Record<string, MemberVideo[]>>({});
    const [loadingVideos, setLoadingVideos] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/admin/members")
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setMembers(d.members);
            })
            .finally(() => setLoading(false));
    }, []);

    const toggleMember = async (memberId: string) => {
        if (expandedId === memberId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(memberId);
        // Load videos nếu chưa có
        if (!memberVideos[memberId]) {
            setLoadingVideos(memberId);
            try {
                const res = await fetch(`/api/video/jobs?instructorId=${memberId}`);
                const data = await res.json();
                if (data.success) {
                    setMemberVideos((prev) => ({ ...prev, [memberId]: data.jobs }));
                }
            } finally {
                setLoadingVideos(null);
            }
        }
    };

    const stats = {
        totalMembers: members.length,
        totalVideos: members.reduce((sum, m) => sum + m._count.videoJobs, 0),
        admins: members.filter((m) => m.role === "admin").length,
        teachers: members.filter((m) => m.role === "teacher").length,
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                    <Building2 className="w-8 h-8 text-brand-500" />
                    Quản trị tổ chức
                </h1>
                <p className="text-gray-500 mt-1">
                    Quản lý thành viên và theo dõi hoạt động
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[
                    { label: "Tổng thành viên", value: stats.totalMembers, icon: Users, color: "blue" },
                    { label: "Admin", value: stats.admins, icon: Building2, color: "purple" },
                    { label: "Giảng viên", value: stats.teachers, icon: Users, color: "green" },
                    { label: "Tổng video", value: stats.totalVideos, icon: Video, color: "orange" },
                ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-gray-500 font-medium">{label}</p>
                            <div className={`p-2 rounded-xl bg-${color}-50`}>
                                <Icon className={`w-4 h-4 text-${color}-600`} />
                            </div>
                        </div>
                        <p className={`text-3xl font-bold text-${color}-700`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Members table */}
            <div className="glass-card overflow-hidden">
                <div className="p-6 border-b border-surface-border flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-brand-400" />
                    <h2 className="text-lg font-semibold text-gray-900">Danh sách thành viên</h2>
                    <span className="text-sm text-gray-400 ml-2">Click để xem video</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tên</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vai trò</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Số video</th>
                                <th className="px-6 py-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {members.map((m) => (
                                <>
                                    <tr
                                        key={m.id}
                                        onClick={() => toggleMember(m.id)}
                                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                                                    <span className="text-sm font-medium text-brand-700">
                                                        {m.name.charAt(0).toUpperCase()}
                                                    </span>
                                                </div>
                                                <span className="text-sm font-medium text-gray-900">{m.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{m.email}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${m.role === "admin"
                                                ? "bg-purple-100 text-purple-700"
                                                : "bg-green-100 text-green-700"
                                                }`}>
                                                {m.role === "admin" ? "Admin" : "Giảng viên"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 font-medium">{m._count.videoJobs}</td>
                                        <td className="px-6 py-4">
                                            {expandedId === m.id
                                                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                                                : <ChevronDown className="w-4 h-4 text-gray-400" />
                                            }
                                        </td>
                                    </tr>

                                    {/* Expanded video list */}
                                    {expandedId === m.id && (
                                        <tr key={`${m.id}-videos`}>
                                            <td colSpan={5} className="px-6 py-4 bg-gray-50/80">
                                                {loadingVideos === m.id ? (
                                                    <div className="flex items-center gap-2 py-3 justify-center">
                                                        <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                                                        <span className="text-sm text-gray-500">Đang tải...</span>
                                                    </div>
                                                ) : (memberVideos[m.id]?.length ?? 0) === 0 ? (
                                                    <p className="text-sm text-gray-400 text-center py-3">Chưa có video</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {memberVideos[m.id]?.map((v) => (
                                                            <Link
                                                                key={v.id}
                                                                href={`/dashboard/videos/${v.id}`}
                                                                className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100 hover:border-brand-300 hover:shadow-sm transition-all"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <Video className="w-4 h-4 text-brand-400" />
                                                                    <div>
                                                                        <p className="text-sm font-medium text-gray-800">{v.title}</p>
                                                                        <p className="text-xs text-gray-400">{v.subject}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <span className={`status-badge text-xs ${getStatusColor(v.status)}`}>
                                                                        {getStatusLabel(v.status)}
                                                                    </span>
                                                                    <span className="text-xs text-gray-400">
                                                                        {getTierLabel(v.tier).split(" — ")[0]}
                                                                    </span>
                                                                    <span className="text-xs text-gray-400">
                                                                        {new Date(v.createdAt).toLocaleDateString("vi-VN")}
                                                                    </span>
                                                                    <ExternalLink className="w-3.5 h-3.5 text-gray-300" />
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

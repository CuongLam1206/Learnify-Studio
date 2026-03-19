import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCost(usd: number): string {
    if (usd < 0.01 && usd > 0) return "<$0.01";
    return `$${usd.toFixed(2)}`;
}

export function formatFileSize(mb: number): string {
    if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
    return `${mb.toFixed(1)} MB`;
}

export function getStatusColor(status: string): string {
    switch (status) {
        case "done":
            return "bg-green-500/20 text-green-400 border border-green-500/30";
        case "processing":
            return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
        case "approved":
            return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
        case "script_generated":
            return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
        case "failed":
            return "bg-red-500/20 text-red-400 border border-red-500/30";
        default:
            return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
    }
}

export function getStatusLabel(status: string): string {
    const map: Record<string, string> = {
        draft: "Bản nháp",
        script_generated: "Đã sinh script",
        approved: "Đã duyệt",
        processing: "Đang xử lý",
        done: "Hoàn thành",
        failed: "Lỗi",
    };
    return map[status] ?? status;
}

export function getTierLabel(tier: number): string {
    switch (tier) {
        case 1: return "🔴 Tier 1 — Avatar AI";
        case 2: return "🟡 Tier 2 — Slide + Voice";
        default: return "Tier " + tier;
    }
}

export function getTierCostEstimate(tier: number, durationMin: number): string {
    switch (tier) {
        case 1: return `~$${(durationMin * 0.6).toFixed(0)}–$${(durationMin * 0.9).toFixed(0)}`;
        case 2: return "$0 — Gemini AI + gTTS miễn phí";
        default: return "N/A";
    }
}

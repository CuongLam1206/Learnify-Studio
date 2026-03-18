"use client";
import Link from "next/link";
import { BrainCircuit, Cpu } from "lucide-react";

export default function HomePage() {
    return (
        <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-[#f5f6f8] relative overflow-hidden">
            {/* Subtle background accent */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-200/40 rounded-full blur-[140px]" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl animate-fade-in">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-gradient-brand rounded-2xl shadow-md">
                        <BrainCircuit className="w-8 h-8 text-white" />
                    </div>
                    <span className="text-3xl font-bold text-gray-900">Learnify</span>
                </div>

                {/* Headline */}
                <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 mb-6 leading-tight">
                    Bài giảng{" "}
                    <span className="text-gradient">thông minh</span>
                    <br />
                    được tạo bởi AI
                </h1>

                <p className="text-lg text-gray-500 mb-12 max-w-xl">
                    Giảng viên nhập outline → AI sinh script → Chọn style video →{" "}
                    <span className="text-gray-700 font-medium">
                        Video bài giảng chuyên nghiệp chỉ trong vài phút.
                    </span>
                </p>

                {/* CTA */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link href="/dashboard" className="btn-primary text-center">
                        Vào Dashboard Giảng viên →
                    </Link>
                    <Link href="/dashboard/videos/new" className="btn-secondary text-center">
                        Tạo video đầu tiên
                    </Link>
                </div>

                {/* Feature pills */}
                <div className="flex flex-wrap justify-center gap-3 mt-14">
                    {[
                        "🎬 Avatar AI từ ảnh GV",
                        "🎙️ Clone giọng thật (F5-TTS)",
                        "📊 Slide tự động",
                        "✏️ Review & chỉnh script",
                        "💾 Xuất MP4 chất lượng cao",
                    ].map((f) => (
                        <span
                            key={f}
                            className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 shadow-sm"
                        >
                            {f}
                        </span>
                    ))}
                </div>
            </div>

            {/* Bottom badge */}
            <div className="relative z-10 mt-16 flex items-center gap-2 text-gray-400 text-sm">
                <Cpu className="w-4 h-4" />
                <span>Powered by HeyGen · F5-TTS · Gemini · FFmpeg</span>
            </div>
        </main>
    );
}

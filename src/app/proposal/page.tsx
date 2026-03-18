import { readFileSync } from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Learnify AI — Proposal",
    description: "Nền tảng tạo video bài giảng tự động với AI",
};

export default function ProposalPage() {
    const filePath = path.join(process.cwd(), "AI_VIDEO_PROPOSAL.md");
    let content = "# Proposal\n\n> File `AI_VIDEO_PROPOSAL.md` chưa có. Vui lòng thêm file này vào thư mục gốc của project.";
    try {
        content = readFileSync(filePath, "utf-8");
    } catch {
        // file không tồn tại → dùng fallback message
    }

    return (
        <div className="min-h-screen bg-[#0f1117] text-gray-100">
            {/* Header */}
            <div className="border-b border-white/10 bg-[#0f1117]/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <span className="text-indigo-400 font-bold text-lg">⚡ Learnify AI</span>
                    <span className="text-xs text-gray-500">Draft Proposal v0.2</span>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-6 py-12">
                <article className="prose prose-invert prose-indigo max-w-none
          prose-h1:text-4xl prose-h1:font-extrabold prose-h1:text-white prose-h1:mb-4
          prose-h2:text-2xl prose-h2:font-bold prose-h2:text-white prose-h2:mt-12 prose-h2:mb-4
          prose-h3:text-xl prose-h3:font-semibold prose-h3:text-indigo-300 prose-h3:mt-8
          prose-p:text-gray-300 prose-p:leading-7
          prose-strong:text-white
          prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-950/30 prose-blockquote:rounded-r-lg prose-blockquote:py-1
          prose-table:text-sm
          prose-th:text-indigo-300 prose-th:font-semibold
          prose-td:text-gray-300
          prose-li:text-gray-300
          prose-hr:border-white/10
        ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </article>
            </div>

            {/* Footer */}
            <div className="border-t border-white/10 mt-16">
                <div className="max-w-4xl mx-auto px-6 py-8 text-center text-gray-600 text-sm">
                    Learnify AI · Powered by Gemini · HeyGen · FFmpeg · Next.js · Deployed on Vercel
                </div>
            </div>
        </div>
    );
}

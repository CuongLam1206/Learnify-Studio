import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    try {
        const { jobId } = await req.json();

        if (!jobId) {
            return NextResponse.json({ success: false, error: "jobId is required" }, { status: 400 });
        }

        // Lấy job + script
        const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
        if (!job) {
            return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
        }

        const script = (job.approvedScript ?? job.generatedScript) as {
            title?: string;
            sections?: { title?: string; narration?: string; slideContent?: string }[];
        } | null;

        if (!script?.sections?.length) {
            return NextResponse.json({ success: false, error: "Script rỗng, không thể sinh quiz" }, { status: 400 });
        }

        // Tổng hợp nội dung bài giảng
        const content = script.sections
            .map((s, i) => `Phần ${i + 1}: ${s.title ?? ""}\n${s.narration ?? ""}\n${s.slideContent ?? ""}`)
            .join("\n\n");

        // Gọi Gemini sinh quiz
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `Bạn là giảng viên đại học. Dựa trên nội dung bài giảng sau, hãy tạo CHÍNH XÁC 5 câu hỏi trắc nghiệm (MCQ) bằng tiếng Việt.

Mỗi câu hỏi có 4 đáp án (A, B, C, D), chỉ 1 đáp án đúng.

CHỈ trả về JSON array, KHÔNG có markdown hay giải thích nào khác:
[
  {
    "question": "Câu hỏi?",
    "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
    "answer": 0,
    "explanation": "Giải thích ngắn tại sao đáp án đúng"
  }
]

Trong đó "answer" là index (0-3) của đáp án đúng trong array "options".

NỘI DUNG BÀI GIẢNG:
${content.slice(0, 8000)}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        // Parse JSON từ response (có thể có markdown wrapper)
        let quizData;
        try {
            // Thử parse trực tiếp
            quizData = JSON.parse(text);
        } catch {
            // Nếu Gemini wrap trong ```json ... ```
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                quizData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Không parse được quiz JSON từ Gemini");
            }
        }

        // Validate format
        if (!Array.isArray(quizData) || quizData.length === 0) {
            throw new Error("Quiz data không hợp lệ");
        }

        // Lưu vào DB
        await prisma.videoJob.update({
            where: { id: jobId },
            data: { quizData },
        });

        return NextResponse.json({
            success: true,
            quiz: quizData,
            questionsCount: quizData.length,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[generate-quiz] Error:", message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

// PUT — Lưu quiz đã chỉnh sửa
export async function PUT(req: NextRequest) {
    try {
        const { jobId, quizData } = await req.json();

        if (!jobId || !Array.isArray(quizData)) {
            return NextResponse.json({ success: false, error: "jobId and quizData[] required" }, { status: 400 });
        }

        await prisma.videoJob.update({
            where: { id: jobId },
            data: { quizData },
        });

        return NextResponse.json({ success: true, questionsCount: quizData.length });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

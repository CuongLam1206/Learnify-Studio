import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const SUPPORTED_TYPES: Record<string, string> = {
    "application/pdf": "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint": "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
};

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value as string;
}

async function analyzeDocument(
    content: { type: "text"; text: string } | { type: "file"; mimeType: string; data: string },
    fileName: string
): Promise<{ subject: string; outline: string; rawContent: string }> {
    const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
        },
    });

    const prompt = `Bạn là chuyên gia phân tích tài liệu giáo dục.
Hãy phân tích tài liệu (tên file: "${fileName}") và trích xuất:

1. **subject**: Tiêu đề môn học/chủ đề ngắn gọn (< 80 ký tự)
2. **outline**: Danh sách các mục chính đánh số, mỗi mục một dòng
3. **rawContent**: Toàn bộ nội dung quan trọng từ tài liệu — đây là phần QUAN TRỌNG NHẤT.
   - Với PDF/DOCX giáo án: trích NỘI DUNG ĐẦY ĐỦ từng phần (định nghĩa, giải thích, ví dụ, công thức...)
   - Với PPTX: nội dung từng slide (tiêu đề + nội dung bullet)
   - Giữ nguyên các thuật ngữ chuyên môn, số liệu, ví dụ
   - Tổ chức theo từng phần/chương có đánh tiêu đề rõ ràng
   - Tối đa 8000 từ

Trả về JSON:
{
  "subject": "tên môn học",
  "outline": "1. Mục A\\n2. Mục B\\n3. Mục C...",
  "rawContent": "## Phần 1: Tiêu đề\\nNội dung chi tiết...\\n\\n## Phần 2: Tiêu đề\\nNội dung chi tiết..."
}

Viết tiếng Việt nếu tài liệu tiếng Việt, tiếng Anh nếu tài liệu tiếng Anh.`;

    let parts;
    if (content.type === "text") {
        parts = [
            { text: prompt },
            { text: `\n\nNội dung tài liệu:\n${content.text.slice(0, 40000)}` },
        ];
    } else {
        parts = [
            { text: prompt },
            { inlineData: { mimeType: content.mimeType, data: content.data } },
        ];
    }

    const result = await model.generateContent(parts);
    const text = result.response.text().trim();

    // Parse JSON — handle markdown wrapper + repair
    let jsonStr = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(jsonStr);
    } catch {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
    }

    return {
        subject: (parsed.subject as string) ?? "Bài giảng",
        outline: (parsed.outline as string) ?? "",
        rawContent: (parsed.rawContent as string) ?? "",
    };
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy file" },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    success: false,
                    error: `File quá lớn. Tối đa 20MB (hiện tại: ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
                },
                { status: 400 }
            );
        }

        const mimeType = file.type;
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        console.log(
            `[extract-outline] file: ${file.name}, type: ${mimeType}, size: ${(file.size / 1024).toFixed(0)}KB`
        );

        if (!SUPPORTED_TYPES[mimeType]) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Loại file không hỗ trợ: ${mimeType}. Chỉ chấp nhận PDF, PPTX, DOCX, DOC.`,
                },
                { status: 400 }
            );
        }

        let content: { type: "text"; text: string } | { type: "file"; mimeType: string; data: string };

        if (
            mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
            mimeType === "application/msword"
        ) {
            // DOCX/DOC → mammoth extract text
            const text = await extractTextFromDocx(fileBuffer);
            content = { type: "text", text };
            console.log(`[extract-outline] mammoth extracted ${text.length} chars`);
        } else {
            // PDF / PPTX → Gemini native
            content = { type: "file", mimeType, data: fileBuffer.toString("base64") };
        }

        const { subject, outline, rawContent } = await analyzeDocument(content, file.name);

        console.log(
            `[extract-outline] subject: "${subject}", outline lines: ${outline.split("\n").length}, rawContent: ${rawContent.length} chars`
        );

        return NextResponse.json({
            success: true,
            subject,
            outline,
            rawContent,       // Nội dung đầy đủ — dùng cho generate-script
            fileName: file.name,
            fileSize: file.size,
        });
    } catch (error: unknown) {
        console.error("[extract-outline] error:", error);
        const message = error instanceof Error ? error.message : "Lỗi không xác định";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

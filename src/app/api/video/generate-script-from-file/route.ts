import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPPORTED_TYPES: Record<string, string> = {
    "application/pdf": "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint": "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
};

async function getDocxText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return value as string;
}

async function getPptxText(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const officeParser = require("officeparser");
    return new Promise((resolve, reject) => {
        officeParser.parseOfficeAsync(buffer, { outputErrorToConsole: false })
            .then((text: string) => resolve(text))
            .catch(reject);
    });
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const durationMinutes = Number(formData.get("durationMinutes") ?? 15);
        const instructorName = (formData.get("instructorName") as string) || "";

        if (!file) {
            return NextResponse.json({ success: false, error: "Không tìm thấy file" }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({
                success: false,
                error: `File quá lớn. Tối đa 20MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
            }, { status: 400 });
        }
        if (!SUPPORTED_TYPES[file.type]) {
            return NextResponse.json({
                success: false,
                error: `Không hỗ trợ loại file: ${file.type}`,
            }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const sectionsCount = Math.max(3, Math.round(durationMinutes / 4));
        const wordsPerMinute = 260; // Edge TTS tiếng Việt thực tế ~250 từ/phút + buffer
        const totalWords = durationMinutes * wordsPerMinute;

        console.log(`[generate-script-from-file] file: ${file.name}, type: ${file.type}, duration: ${durationMinutes}m, sections: ${sectionsCount}`);

        const prompt = `Nhiem vu: Doc TOAN BO noi dung tai lieu dinh kem va chuyen thanh script video bai giang.

NGUYEN TAC QUAN TRONG NHAT:
- narration cua moi section = LAY CHINH NOI DUNG tu tai lieu, chi sua nhe cho phu hop giong noi (bo heading, them 1-2 cau dan dat)
- TUYET DOI KHONG tu viet hay them thong tin ngoai tai lieu
- Giu NGUYEN: so lieu, ten, su kien, dinh nghia, vi du, trich dan tu tai lieu goc

Thong tin:
- Thoi luong: ${durationMinutes} phut (~${totalWords} tu tong cong)
- So section: ${sectionsCount}
${instructorName ? `- Giang vien: ${instructorName}` : ""}

Huong dan tung buoc:
1. Doc het tai lieu
2. Xac dinh cac phan chinh cua tai lieu => lam tieu de section
3. Voi moi section: copy doan text tuong ung tu tai lieu, chinh sua toi thieu:
   - Bo so thu tu dau dong ("I.", "1.", "Chuong 1:", "Phan A:")
   - Them cau dan dat dau moi section ("Tiep theo, chung ta tim hieu ve...", "Trong phan nay...")
   - Viet thanh van xuoi, khong dung bullet trong narration
   - Giu nguyen noi dung goc
4. slideContent: 4-5 bullet ngan lay tu y chinh thuc te cua phan do

Output JSON (CHI JSON, khong them markdown wrapper):
{
  "title": "ten bai giang chinh xac lay tu tai lieu",
  "estimatedDuration": "${durationMinutes}:00",
  "totalWords": ${totalWords},
  "sections": [
    {
      "index": 0,
      "title": "tieu de phan lay tu tai lieu",
      "durationSeconds": ${Math.round((durationMinutes * 60) / sectionsCount)},
      "narration": "Noi dung lay tu tai lieu, chi sua nhe cho giong noi tu nhien...",
      "slideContent": "y chinh 1 | y chinh 2 | y chinh 3 | y chinh 4",
      "imageKeyword": "english 2-4 word photo search keyword"
    }
  ]
}`;

        let result;

        if (file.type === "application/pdf") {
            // PDF: Gemini native inlineData (supported)
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
            });
            result = await model.generateContent([
                { text: prompt },
                { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
            ]);
        } else {
            // PPTX/PPT/DOCX/DOC: extract text rồi gửi dạng text
            let extractedText: string;

            if (
                file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                file.type === "application/msword"
            ) {
                extractedText = await getDocxText(buffer);
                console.log(`[generate-script-from-file] mammoth extracted ${extractedText.length} chars`);
            } else {
                // PPTX / PPT → officeparser
                extractedText = await getPptxText(buffer);
                console.log(`[generate-script-from-file] officeparser extracted ${extractedText.length} chars`);
            }

            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
            });
            result = await model.generateContent([
                { text: prompt },
                { text: `\n\n====NOI DUNG TAI LIEU (${file.name})====\n${extractedText.slice(0, 50000)}\n====KET THUC====` },
            ]);
        }

        const rawText = result.response.text().trim();
        console.log(`[generate-script-from-file] response length: ${rawText.length}`);

        // ── Robust JSON parsing ──────────────────────────────────────────────
        // Gemini đôi khi trả về JSON bỏ broken — thử nhiều fallback
        let parsed: unknown = null;

        const cleanJson = (raw: string): string => {
            return raw
                .replace(/^```json\s*/i, "").replace(/^```\s*/i, "")   // strip markdown
                .replace(/```\s*$/g, "")                                 // strip trailing ```
                .trim();
        };

        const tryParse = (s: string): unknown => {
            // 1. Direct parse
            try { return JSON.parse(s); } catch { /* continue */ }

            // 2. Extract first complete {...} object
            const objMatch = s.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try { return JSON.parse(objMatch[0]); } catch { /* continue */ }
            }

            // 3. Truncate to last valid closing brace
            const lastBrace = s.lastIndexOf("}");
            if (lastBrace > 0) {
                try { return JSON.parse(s.slice(0, lastBrace + 1)); } catch { /* continue */ }
            }

            // 4. Extract first [...] array
            const arrMatch = s.match(/\[[\s\S]*\]/);
            if (arrMatch) {
                try { return JSON.parse(arrMatch[0]); } catch { /* continue */ }
            }

            throw new SyntaxError("Cannot parse JSON response from Gemini");
        };

        const jsonStr = cleanJson(rawText);
        parsed = tryParse(jsonStr);
        type RawData = Record<string, unknown>;
        const rawData: RawData = Array.isArray(parsed)
            ? (parsed as RawData[])[0]
            : (parsed as RawData);

        const rawSections: RawData[] =
            (rawData.sections ?? rawData.section ?? rawData.slides ?? rawData.content ?? rawData.parts ?? []) as RawData[];

        const scriptData = {
            title: rawData.title ?? rawData.lessonTitle ?? "Bài giảng",
            estimatedDuration: rawData.estimatedDuration ?? `${durationMinutes}:00`,
            totalWords: rawData.totalWords ?? totalWords,
            sections: (rawSections as Record<string, unknown>[]).map((s, i) => ({
                ...s,
                index: i,
                title: s.title ?? s.sectionTitle ?? `Phần ${i + 1}`,
                narration: s.narration ?? s.voiceOver ?? s.script ?? "",
                slideContent: ((): string => {
                    const raw = s.slideContent ?? s.content ?? s.bullets;
                    if (typeof raw !== "string") return "";
                    return raw.includes("|")
                        ? raw.split("|").map((b) => `• ${b.trim()}`).join("\n")
                        : raw;
                })(),
                durationSeconds:
                    s.durationSeconds ??
                    Math.round((durationMinutes * 60) / Math.max(rawSections.length, 1)),
                imageKeyword: typeof s.imageKeyword === "string" ? s.imageKeyword.trim() : "",
            })),
        };

        console.log(`[generate-script-from-file] sections: ${scriptData.sections.length}`);
        return NextResponse.json({ success: true, script: scriptData });
    } catch (error: unknown) {
        console.error("[generate-script-from-file] error:", error);
        const message = error instanceof Error ? error.message : "Lỗi không xác định";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

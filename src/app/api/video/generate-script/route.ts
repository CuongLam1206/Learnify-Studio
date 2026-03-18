import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const schema = z.object({
  subject: z.string().min(3),
  outline: z.string().min(5),
  durationMinutes: z.number().min(3).max(60),
  instructorName: z.string().optional(),
  rawContent: z.string().optional(), // Nội dung gốc từ PDF/DOC
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, outline, durationMinutes, instructorName, rawContent } =
      schema.parse(body);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: rawContent ? 0.3 : 0.7,
        maxOutputTokens: 8192, // Đủ cho ~15-20 phút, tránh JSON bị cắt
      },
    });

    const wordsPerMinute = 200; // Giảm xuống để tránh JSON quá dài bị cắt
    const totalWords = durationMinutes * wordsPerMinute;
    const sectionsCount = Math.max(3, Math.round(durationMinutes / 4));
    const wordsPerSection = Math.round(totalWords / sectionsCount);

    // ─── Prompt khi có nội dung tài liệu gốc ───────────────────────────────────
    const promptFromDoc = `Nhiem vu: Chuyen tai lieu goc thanh script video bai giang BANG CACH CHIA NOI DUNG GOC THANH CAC SECTION.

QUAN TRONG: Ban PHAI dung chinh noi dung tu tai lieu goc de lam narration. TUYET DOI KHONG tu viet hay sang tac noi dung moi.

Mon hoc: ${subject}
Thoi luong: ${durationMinutes} phut
So section: ${sectionsCount}
${instructorName ? `Giang vien: ${instructorName}` : ""}

====TAI LIEU GOC (COPY TRUC TIEP TU DAY)====
${rawContent!.slice(0, 25000)}
====KET THUC TAI LIEU GOC====

HUONG DAN:
1. Doc toan bo tai lieu goc o tren
2. Chia noi dung thanh dung ${sectionsCount} phan hop ly theo noi dung that su trong tai lieu
3. Moi section: narration = LAY NGUYEN VAN doan text tuong ung tu tai lieu, chi chinh sua toi thieu:
   - Bo heading/so thu tu (vi du: bo "I.", "1.", "Phan 1:")  
   - Them 1-2 cau dan dat o dau moi section ("Tiep theo chung ta tim hieu ve...")
   - Giu NGUYEN 100% noi dung: so lieu, ten, su kien, dinh nghia, vi du
   - KHONG them bat ky thong tin nao ngoai tai lieu
4. slideContent: tom tat cac y chinh thuc te trong phan do bang 4-5 bullet ngan (lay tu noi dung tai lieu)

Tra ve JSON:
{
  "title": "ten bai giang lay tu tai lieu",
  "estimatedDuration": "${durationMinutes}:00",
  "totalWords": ${totalWords},
  "sections": [
    {
      "index": 0,
      "title": "tieu de phan lay tu tai lieu",
      "durationSeconds": ${Math.round((durationMinutes * 60) / sectionsCount)},
      "narration": "TEXT LAY TRUC TIEP TU TAI LIEU, chi chinh sua nhe de phu hop giong noi",
      "slideContent": "y chinh 1 | y chinh 2 | y chinh 3 | y chinh 4",
      "imageKeyword": "english 2-4 word keyword describing the image for this slide"
    }
  ]
}`;

    // ─── Prompt khi KHÔNG có tài liệu (AI tự gen) ─────────────────────────────
    const promptFromOutline = `Ban la chuyen gia thiet ke bai giang dai hoc chuyen nghiep.
Tao script bai giang hoan chinh bang tieng Viet dua tren thong tin sau:

Mon hoc: ${subject}
Thoi luong: ${durationMinutes} phut (~${totalWords} tu voice-over)
So phan: ${sectionsCount}
${instructorName ? `Giang vien: ${instructorName}` : ""}

Outline:
${outline}

Tra ve JSON voi cau truc chinh xac sau:
{
  "title": "tieu de bai giang",
  "estimatedDuration": "${durationMinutes}:00",
  "totalWords": ${totalWords},
  "sections": [
    {
      "index": 0,
      "title": "tieu de phan",
      "durationSeconds": ${Math.round((durationMinutes * 60) / sectionsCount)},
      "narration": "noi dung GV doc, viet tu nhien ~${wordsPerSection} tu",
      "slideContent": "bullet1 | bullet2 | bullet3",
      "imageKeyword": "relevant english keyword for stock photo search, 2-4 words"
    }
  ]
}

  Yeu cau:
- Tao dung ${sectionsCount} sections: Gioi thieu tong quan -> Noi dung chinh (cac phan) -> Tom tat va Ket luan
- QUAN TRONG: Moi section narration phai co IT NHAT ${wordsPerSection} tu. Tong narration ca bai: IT NHAT ${totalWords} tu
- Narration viet day du, tu nhien nhu GV giang that su: giai thich ro, co vi du, lien ket giua cac y. KHONG viet tat!
- slideContent dung dau | de phan cach bullet, toi da 5 bullet ngan gon
- imageKeyword: MUST be English, 2-4 words describing a relevant image (e.g. "python programming loop", "vietnam history war", "social media youth")
- Viet narration va slideContent hoan toan bang tieng Viet, giong dieu than thien hoc thuat`;

    const prompt = rawContent ? promptFromDoc : promptFromOutline;

    console.log(
      `[generate-script] mode: ${rawContent ? "from-document" : "from-outline"}, ` +
      `duration: ${durationMinutes}m, sections: ${sectionsCount}`
    );

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    console.log("[generate-script] raw response length:", text.length);
    console.log("[generate-script] raw preview:", text.slice(0, 300));

    // Parse JSON — handle possible markdown wrapper + repair common issues
    let jsonStr = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

    // Repair: remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, "$1");
    // Repair: escape unescaped control chars inside strings (newline, tab trong string)
    jsonStr = jsonStr.replace(/(?<=":[\s]*"[^"]*)\n(?=[^"]*")/g, "\\n");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: extract first {...} block
      const match = jsonStr.match(/\{[\s\S]*/);
      if (match) {
        // Complete truncated JSON bằng cách đóng tất cả bracket mở
        let incomplete = match[0];
        const openBraces = (incomplete.match(/\{/g) || []).length;
        const closeBraces = (incomplete.match(/\}/g) || []).length;
        const openBrackets = (incomplete.match(/\[/g) || []).length;
        const closeBrackets = (incomplete.match(/\]/g) || []).length;
        // Đóng string đang mở nếu có
        const lastQuotePos = incomplete.lastIndexOf('"');
        const beforeLastQuote = incomplete.slice(0, lastQuotePos);
        const openQuotes = (beforeLastQuote.match(/(?<!\\)"/g) || []).length;
        if (openQuotes % 2 !== 0) incomplete += '"';
        // Đóng array và object
        for (let i = 0; i < openBrackets - closeBrackets; i++) incomplete += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) incomplete += '}';
        // Xóa trailing comma
        incomplete = incomplete.replace(/,\s*([\]\}])/g, '$1');
        try {
          parsed = JSON.parse(incomplete);
          console.log('[generate-script] Recovered truncated JSON successfully');
        } catch {
          console.error("[generate-script] JSON unrecoverable, raw:", jsonStr.slice(0, 500));
          throw new Error(`JSON parse failed: response was truncated. Try a shorter duration.`);
        }
      } else {
        throw new Error(`JSON parse failed: no JSON object found in response.`);
      }
    }

    // Unwrap array nếu cần
    const rawData = Array.isArray(parsed) ? parsed[0] : parsed;

    const rawSections: unknown[] =
      rawData.sections ??
      rawData.section ??
      rawData.slides ??
      rawData.content ??
      rawData.parts ??
      [];

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
        imageKeyword:
          typeof s.imageKeyword === "string" ? s.imageKeyword.trim() : "",
      })),
    };

    console.log("[generate-script] parsed sections:", scriptData.sections.length);
    return NextResponse.json({ success: true, script: scriptData });
  } catch (error: unknown) {
    console.error("Script generation error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

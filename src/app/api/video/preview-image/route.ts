import { NextRequest, NextResponse } from "next/server";

// ─── Gemini Image Gen ─────────────────────────────────────────────────────────
async function generateGeminiImage(prompt: string): Promise<string | null> {
    const apiKey = process.env.GEMINI_API_KEY!;
    if (!apiKey) return null;

    const CONFIGS = [
        // Ưu tiên model ảnh nhanh nhất
        { apiVer: "v1beta", model: "gemini-2.5-flash-image" },
        // Fallback sang model mới hơn
        { apiVer: "v1beta", model: "gemini-3.1-flash-image-preview" },
        // Fallback cuối cùng: model Pro cho ảnh
        { apiVer: "v1beta", model: "gemini-3-pro-image-preview" },
    ];

    for (const { apiVer, model } of CONFIGS) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/${apiVer}/models/${model}:generateContent`,
                {
                    method: "POST",
                    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { 
                            responseModalities: ["IMAGE"],
                            // Một số model Imagen yêu cầu tham số này
                            candidateCount: 1
                        },
                    }),
                    signal: AbortSignal.timeout(45000), // Tăng timeout cho việc tạo ảnh
                }
            );

            if (!res.ok) {
                console.error(`[ImageGen] Model ${model} failed with status ${res.status}`);
                continue;
            }

            const data = await res.json();
            const parts = data?.candidates?.[0]?.content?.parts ?? [];
            
            for (const part of parts) {
                const b64 = part?.inlineData?.data;
                const mime = part?.inlineData?.mimeType ?? "image/png";
                if (b64) {
                    console.log(`[ImageGen] ✅ Success with model: ${model}`);
                    return `data:${mime};base64,${b64}`;
                }
            }
        } catch (err) {
            console.error(`[ImageGen] Error with model ${model}:`, err);
        }
    }
    return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const { keyword, title } = await req.json();

        if (!keyword && !title) {
            return NextResponse.json({ success: false, error: "No keyword" }, { status: 400 });
        }

        const topic = (keyword || title || "").slice(0, 80);

        const prompt =
            `A clean educational infographic illustration about: ${topic}. ` +
            "Style: flat design, 16:9 ratio, light background, " +
            "visual icons and symbols only, purely image-based with absolutely zero text, " +
            "no words, no letters, no labels, no captions anywhere.";

        const imageDataUrl = await generateGeminiImage(prompt);

        if (!imageDataUrl) {
            return NextResponse.json({ success: false, error: "No image generated" });
        }

        return NextResponse.json({ success: true, imageDataUrl, engine: "gemini" });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

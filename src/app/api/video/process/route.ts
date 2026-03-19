import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Trigger video processing
export async function POST(req: NextRequest) {
    try {
        const { jobId, tier, script_override, instructor_photo_base64, avatar_intro, subtitle } = await req.json();

        await prisma.videoJob.update({
            where: { id: jobId },
            data: { status: "processing", progress: 0 },
        });

        const job = await prisma.videoJob.findUnique({
            where: { id: jobId },
            include: { instructor: true },
        });

        if (!job) {
            return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
        }

        const scriptToSend = script_override ?? job.approvedScript;

        // ── Option 1: RunPod Serverless ──────────────────────────────────────
        const runpodApiKey   = process.env.RUNPOD_API_KEY ?? "";
        const runpodEndpoint = process.env.RUNPOD_ENDPOINT_ID ?? "";

        if (runpodApiKey && runpodEndpoint) {
            try {
                const res = await fetch(
                    `https://api.runpod.ai/v2/${runpodEndpoint}/run`,
                    {
                        method : "POST",
                        headers: {
                            "Content-Type" : "application/json",
                            "Authorization": `Bearer ${runpodApiKey}`,
                        },
                        body: JSON.stringify({
                            input: {
                                job_id          : jobId,
                                tier,
                                script          : scriptToSend,
                                instructor      : {
                                    voice_ref_url  : job.instructor.voiceRefUrl,
                                    photo_base64   : instructor_photo_base64 ?? "",
                                },
                                duration_minutes: job.durationMinutes,
                                voice_id        : job.voiceId ?? "vi-VN-HoaiMyNeural",
                                slide_theme     : job.slideTheme ?? "dark",
                                image_engine    : (scriptToSend as { imageEngine?: string })?.imageEngine ?? "gemini",
                                avatar_intro    : avatar_intro ?? "",
                                subtitle        : subtitle ?? true,
                                // Vercel callback URL để worker update status
                                next_api_url    : process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
                            },
                        }),
                        signal: AbortSignal.timeout(10_000),
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    console.log(`[RunPod] Job ${jobId} queued: ${data.id}`);
                    return NextResponse.json({ success: true, message: "RunPod processing", runpodJobId: data.id });
                }
            } catch (err) {
                console.error("[RunPod] Failed to queue job:", err);
            }
        }

        // ── Option 2: Fallback — Local worker HTTP ───────────────────────────
        const workerUrl = process.env.PYTHON_WORKER_URL ?? "http://localhost:8000";
        let useDemo = true;

        try {
            const health = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(2000) });
            if (health.ok && (tier === 2 || (tier === 1 && instructor_photo_base64))) {
                const res = await fetch(`${workerUrl}/process`, {
                    method : "POST",
                    headers: { "Content-Type": "application/json" },
                    body   : JSON.stringify({
                        job_id          : jobId,
                        tier,
                        script          : scriptToSend,
                        instructor      : {
                            voice_ref_url: job.instructor.voiceRefUrl,
                            photo_base64 : instructor_photo_base64 ?? "",
                        },
                        duration_minutes: job.durationMinutes,
                        voice_id        : job.voiceId ?? "vi-VN-HoaiMyNeural",
                        slide_theme     : job.slideTheme ?? "dark",
                        image_engine    : (scriptToSend as { imageEngine?: string })?.imageEngine ?? "gemini",
                        avatar_intro    : avatar_intro ?? "",
                        subtitle        : subtitle ?? true,
                    }),
                    signal: AbortSignal.timeout(5000),
                });
                if (res.ok) useDemo = false;
            }
        } catch {
            console.log(`Tier ${tier}: worker unavailable — using demo simulation`);
        }

        if (useDemo) {
            simulateDemoProgress(jobId, tier).catch(console.error);
        }

        return NextResponse.json({ success: true, message: useDemo ? "Demo simulation started" : "Worker processing" });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

// Demo mode: simulate realistic progress without real worker
async function simulateDemoProgress(jobId: string, tier: number) {
    const steps = [10, 25, 40, 55, 70, 85, 95, 100];
    const baseDelay = tier === 1 ? 3000 : 2000; // tier 1 chậm hơn (HeyGen)

    for (let i = 0; i < steps.length; i++) {
        await new Promise((r) => setTimeout(r, baseDelay + i * 500));

        if (steps[i] === 100) {
            await prisma.videoJob.update({
                where: { id: jobId },
                data: {
                    status: "done",
                    progress: 100,
                    outputUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
                    durationSeconds: 596,
                    fileSizeMb: 158.5,
                    costUsd: tier === 1 ? 8.5 : tier === 2 ? 0.45 : 0,
                },
            });
            // Auto-extract thumbnail sau khi done
            try {
                const baseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
                await fetch(`${baseUrl}/api/video/thumbnail/${jobId}`);
            } catch {
                // Thumbnail extract thất bại không sao, UI sẽ fallback
            }
        } else {
            await prisma.videoJob.update({
                where: { id: jobId },
                data: { progress: steps[i] },
            });
        }
    }
}

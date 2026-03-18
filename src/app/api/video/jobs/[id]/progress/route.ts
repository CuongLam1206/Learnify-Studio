import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// SSE endpoint for real-time job progress
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();
            let closed = false;

            const safeClose = () => {
                if (!closed) {
                    closed = true;
                    try { controller.close(); } catch { /* already closed */ }
                }
            };

            const send = (data: object) => {
                if (closed) return;
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    );
                } catch {
                    closed = true;
                }
            };

            let attempts = 0;
            const MAX_ATTEMPTS = 200; // 10 minutes max

            const poll = async () => {
                if (closed || req.signal.aborted) { safeClose(); return; }
                if (attempts >= MAX_ATTEMPTS) {
                    send({ status: "timeout" });
                    safeClose();
                    return;
                }
                attempts++;

                try {
                    const job = await prisma.videoJob.findUnique({
                        where: { id },
                        select: {
                            status: true,
                            progress: true,
                            outputUrl: true,
                            thumbnailUrl: true,
                            durationSeconds: true,
                            costUsd: true,
                            errorMessage: true,
                        },
                    });

                    if (!job) {
                        send({ status: "not_found" });
                        safeClose();
                        return;
                    }

                    send(job);

                    if (job.status === "done" || job.status === "failed") {
                        safeClose();
                        return;
                    }

                    setTimeout(poll, 3000);
                } catch {
                    safeClose();
                }
            };

            req.signal.addEventListener("abort", safeClose);
            await poll();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

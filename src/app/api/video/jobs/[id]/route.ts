import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { unlink } from "fs/promises";
import path from "path";

const updateSchema = z.object({
    status: z.string().optional(),
    approvedScript: z.any().optional(),
    tier: z.number().optional(),
    outputUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    durationSeconds: z.number().optional(),
    fileSizeMb: z.number().optional(),
    costUsd: z.number().optional(),
    progress: z.number().optional(),
    errorMessage: z.string().optional(),
});

// GET — get single job
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const job = await prisma.videoJob.findUnique({
            where: { id },
            include: {
                instructor: { select: { name: true, avatarPhotoUrl: true } },
                slides: { orderBy: { slideIndex: "asc" } },
            },
        });

        if (!job) {
            return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, job });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

// PATCH — update job (approve script, update status, set output)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const data = updateSchema.parse(body);

        const job = await prisma.videoJob.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        return NextResponse.json({ success: true, job });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

// DELETE — xóa job và file video
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const job = await prisma.videoJob.findUnique({ where: { id } });
        if (!job) {
            return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
        }

        // Xóa file mp4 nếu tồn tại
        const videoPath = path.join(process.cwd(), "public", "videos", `${id}.mp4`);
        try { await unlink(videoPath); } catch { /* file không tồn tại — bỏ qua */ }

        // Xóa DB record (cascade xóa slides liên quan)
        await prisma.videoJob.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

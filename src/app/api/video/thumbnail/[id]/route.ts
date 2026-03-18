import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

// GET /api/video/thumbnail/[id]
// Extract frame at 0s from outputUrl bằng ffmpeg, lưu vào public/thumbnails/
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const job = await prisma.videoJob.findUnique({
            where: { id },
        });

        if (!job) {
            return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
        }

        // Đã có thumbnail → trả về URL ngay
        if (job.thumbnailUrl) {
            return NextResponse.json({ success: true, thumbnailUrl: job.thumbnailUrl });
        }

        if (!job.outputUrl) {
            return NextResponse.json({ success: false, error: "No output video yet" }, { status: 400 });
        }

        // Tạo thư mục thumbnails trong public/
        const thumbDir = path.join(process.cwd(), "public", "thumbnails");
        await fs.mkdir(thumbDir, { recursive: true });

        const filename = `${id}.jpg`;
        const localPath = path.join(thumbDir, filename);

        // FFmpeg: extract frame tại giây 1 (để tránh black frame đầu)
        await execAsync(
            `ffmpeg -y -ss 1 -i "${job.outputUrl}" -vframes 1 -q:v 2 "${localPath}"`,
            { timeout: 30000 }
        );

        // URL public
        const thumbnailUrl = `/thumbnails/${filename}`;

        // Lưu vào DB
        await prisma.videoJob.update({
            where: { id },
            data: { thumbnailUrl },
        });

        return NextResponse.json({ success: true, thumbnailUrl });
    } catch (error: unknown) {
        // FFmpeg không có → trả về null (UI sẽ fallback icon)
        console.error("[thumbnail] ffmpeg error:", error);
        return NextResponse.json({ success: false, thumbnailUrl: null }, { status: 500 });
    }
}

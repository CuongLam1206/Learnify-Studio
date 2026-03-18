import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
    instructorId: z.string(),
    title: z.string().min(3),
    subject: z.string().min(3),
    outline: z.string().default(""),
    durationMinutes: z.number().min(3).max(60),
    tier: z.number().min(1).max(3),
    voiceId: z.string().default("vi-VN-HoaiMyNeural"),
    slideTheme: z.string().default("dark"),
    generatedScript: z.any(),
    approvedScript: z.any().optional(),
});

// POST — create new video job
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const data = createSchema.parse(body);

        // Upsert instructor trước để tránh foreign key constraint lỗi khi demo
        await prisma.instructor.upsert({
            where: { id: data.instructorId },
            update: {},
            create: {
                id: data.instructorId,
                name: "Demo Instructor",
                email: `${data.instructorId}@learnify.demo`,
                password: "demo-password-hash",
            },
        });


        const job = await prisma.videoJob.create({
            data: {
                instructorId: data.instructorId,
                title: data.title,
                subject: data.subject,
                outline: data.outline,
                durationMinutes: data.durationMinutes,
                tier: data.tier,
                voiceId: data.voiceId,
                slideTheme: data.slideTheme,
                generatedScript: data.generatedScript,
                approvedScript: data.approvedScript ?? null,
                status: data.approvedScript ? "approved" : "script_generated",
            },
        });

        return NextResponse.json({ success: true, job });
    } catch (error: unknown) {
        console.error("prisma:error", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

// GET — list jobs for an instructor
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const instructorId = searchParams.get("instructorId") ?? "";

        const jobs = await prisma.videoJob.findMany({
            where: instructorId ? { instructorId } : {},
            orderBy: { createdAt: "desc" },
            include: { instructor: { select: { name: true } } },
        });

        return NextResponse.json({ success: true, jobs });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

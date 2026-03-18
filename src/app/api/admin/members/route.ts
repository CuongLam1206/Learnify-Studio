import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
    try {
        const session = await getAuth();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = session.user as any;
        const role = user.role ?? "teacher";
        const orgId = user.organizationId;

        // Chỉ admin mới được xem
        if (role !== "admin") {
            return NextResponse.json({ success: false, error: "Forbidden — chỉ Admin mới truy cập" }, { status: 403 });
        }

        // Lấy tất cả thành viên cùng organization
        const where = orgId ? { organizationId: orgId } : {};
        const members = await prisma.instructor.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                _count: { select: { videoJobs: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ success: true, members });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

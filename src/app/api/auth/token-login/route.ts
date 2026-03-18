import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encode } from "next-auth/jwt";

// GET /api/auth/token-login?token=Abc123456&redirect=/dashboard
// Auto-login bằng token — dùng cho iframe embed
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const redirectTo = searchParams.get("redirect") || "/dashboard";

    // Validate token
    const validToken = process.env.IFRAME_TOKEN || process.env.NEXTAUTH_SECRET;
    if (!token || token !== validToken) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Lấy admin đầu tiên trong DB để tạo session
    const admin = await prisma.instructor.findFirst({
        where: { role: "admin" },
        include: { organization: true },
    });

    if (!admin) {
        return NextResponse.json({ error: "No admin user found" }, { status: 404 });
    }

    // Tạo JWT session token (giống NextAuth tạo)
    const sessionToken = await encode({
        token: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            organizationId: admin.organizationId ?? null,
            organizationName: admin.organization?.name ?? null,
            sub: admin.id,
        },
        secret: process.env.NEXTAUTH_SECRET!,
        maxAge: 60 * 60 * 24, // 24 giờ
    });

    // Set cookie session và redirect
    const response = NextResponse.redirect(new URL(redirectTo, req.url));
    response.cookies.set("next-auth.session-token", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24, // 24 giờ
    });

    // Production (HTTPS) dùng cookie name khác
    if (process.env.NODE_ENV === "production") {
        response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none", // cần cho iframe cross-origin
            path: "/",
            maxAge: 60 * 60 * 24,
        });
    }

    return response;
}

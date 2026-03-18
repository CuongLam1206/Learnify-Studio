import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
    name: z.string().min(2, "Tên tối thiểu 2 ký tự"),
    email: z.string().email("Email không hợp lệ"),
    password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, email, password } = schema.parse(body);

        // Check email đã tồn tại chưa
        const existing = await prisma.instructor.findUnique({ where: { email } });
        if (existing) {
            return NextResponse.json(
                { success: false, error: "Email đã được sử dụng" },
                { status: 409 }
            );
        }

        const hashed = await bcrypt.hash(password, 12);
        const instructor = await prisma.instructor.create({
            data: { name, email, password: hashed },
            select: { id: true, name: true, email: true, createdAt: true },
        });

        return NextResponse.json({ success: true, instructor }, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: error.errors[0].message },
                { status: 400 }
            );
        }
        const message = error instanceof Error ? error.message : "Lỗi server";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}

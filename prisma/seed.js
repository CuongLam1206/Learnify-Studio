/**
 * Seed: tạo user demo (nếu chưa có)
 * Chạy: npx ts-node --skip-project prisma/seed.ts
 * Hoặc: node -e "require('./prisma/seed.js')" (sau khi build)
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
    const email = "demo@learnify.vn";
    const existing = await prisma.instructor.findUnique({ where: { email } });
    if (existing) {
        console.log(`✅ User demo đã tồn tại: ${email}`);
        return;
    }
    const hashed = await bcrypt.hash("demo123456", 12);
    const user = await prisma.instructor.create({
        data: {
            name: "Giảng viên Demo",
            email,
            password: hashed,
        },
    });
    console.log(`✅ Tạo user demo thành công: ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Mật khẩu: demo123456`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

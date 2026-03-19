// Script tạo admin user đầu tiên cho Neon DB
// Chạy: node scripts/seed-admin.js

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "admin@learnify.vn";
  const password = "Abc123456";
  const name = "Admin Learnify";

  const existing = await prisma.instructor.findUnique({ where: { email } });
  if (existing) {
    console.log("✅ Admin đã tồn tại:", existing.email);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);

  // Tạo organization trước nếu cần
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Learnify", slug: "learnify" },
    });
    console.log("✅ Tạo organization:", org.name);
  }

  const admin = await prisma.instructor.create({
    data: {
      name,
      email,
      password: hashed,
      role: "admin",
      organizationId: org.id,
    },
  });

  console.log("✅ Admin tạo thành công:", admin.email, "| role:", admin.role);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

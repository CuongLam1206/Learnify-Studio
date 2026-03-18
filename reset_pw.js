const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const p = new PrismaClient();

async function main() {
    const newPassword = '123456';
    const hash = await bcrypt.hash(newPassword, 10);

    const result = await p.instructor.update({
        where: { email: 'demo-instructor-001@learnify.demo' },
        data: { password: hash },
    });

    console.log(`Done! ${result.name} - new password: ${newPassword}`);
}

main().finally(() => p.$disconnect());

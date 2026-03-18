const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
    // Xóa tất cả video jobs trong DB
    const result = await p.videoJob.deleteMany({});
    console.log(`✅ Đã xóa ${result.count} video jobs trong DB`);

    // Xóa file video trong public/videos
    const videoDir = path.join(__dirname, 'public', 'videos');
    if (fs.existsSync(videoDir)) {
        const files = fs.readdirSync(videoDir);
        for (const file of files) {
            fs.unlinkSync(path.join(videoDir, file));
        }
        console.log(`✅ Đã xóa ${files.length} file trong public/videos`);
    } else {
        console.log('⚠️ Thư mục public/videos không tồn tại');
    }
}

main().finally(() => p.$disconnect());

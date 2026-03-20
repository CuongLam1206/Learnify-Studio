
const https = require('https');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = "AIzaSyBEiYpQb3Fdx9FitRQeswIGiBjYGCHGwyo";
const OUTPUT_DIR = path.join(__dirname, 'test_images');

function postRequest(url, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = https.request(url, {
            method: 'POST',
            timeout: 60000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error("Invalid JSON")); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function testAndSave(model, filename) {
    console.log(`\nGenerating with ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: "A clean educational infographic illustration about: Artificial Intelligence in Education. Style: flat design, 16:9 ratio, light background, visual icons and symbols only, purely image-based with absolutely zero text, no words, no letters, no labels, no captions anywhere." }] }],
        generationConfig: { responseModalities: ["IMAGE"], candidateCount: 1 }
    };

    try {
        const data = await postRequest(url, payload);
        if (data.error) { console.log(`  ❌ ERROR: ${data.error.message}`); return; }

        const parts = data?.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
            if (part.inlineData) {
                const ext = part.inlineData.mimeType === 'image/png' ? 'png' : 'jpg';
                const filepath = path.join(OUTPUT_DIR, `${filename}.${ext}`);
                fs.writeFileSync(filepath, Buffer.from(part.inlineData.data, 'base64'));
                console.log(`  ✅ Saved: ${filepath}`);
                return;
            }
        }
        console.log(`  ❌ No image in response`);
    } catch (err) {
        console.log(`  💥 ${err.message}`);
    }
}

async function run() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
    console.log("=== Generating images from 3 models ===\n");

    await testAndSave("gemini-2.5-flash-image", "1_gemini_2.5_flash_image");
    await testAndSave("gemini-3.1-flash-image-preview", "2_gemini_3.1_flash_image");
    await testAndSave("gemini-3-pro-image-preview", "3_gemini_3_pro_image");

    console.log(`\n=== Done! Open folder: ${OUTPUT_DIR} ===`);
    process.exit(0);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });

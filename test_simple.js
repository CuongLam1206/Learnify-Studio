
const https = require('https');
const fs = require('fs');

const API_KEY = "AIzaSyBEiYpQb3Fdx9FitRQeswIGiBjYGCHGwyo";
const MODEL = "gemini-1.5-flash"; // Start with something very stable

function test() {
  console.log("Starting test...");
  const data = JSON.stringify({
    contents: [{ parts: [{ text: "Say 'API_IS_ONLINE' if you see this." }] }]
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: `/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      fs.writeFileSync('test_result.json', body);
      console.log("Done. Check test_result.json");
    });
  });

  req.on('error', (e) => {
    fs.writeFileSync('test_result.json', JSON.stringify({ error: e.message }));
  });

  req.write(data);
  req.end();
}

test();

// Cloudflare Worker — R2 Upload Proxy
// Deploy: Cloudflare Dashboard → Workers & Pages → Create Worker
// Bind R2 bucket: Settings → R2 Bucket Bindings → Variable name: R2_BUCKET → Select bucket: learnify-videos
// Add secret: Settings → Variables → UPLOAD_SECRET = <random string>

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
        },
      });
    }

    if (request.method !== 'PUT') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Auth check
    const authKey = request.headers.get('X-Upload-Key');
    if (!env.UPLOAD_SECRET || authKey !== env.UPLOAD_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get object key from URL path
    const url = new URL(request.url);
    const key = url.pathname.slice(1); // Remove leading /

    if (!key) {
      return Response.json({ error: 'Missing object key' }, { status: 400 });
    }

    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

    try {
      // Upload trực tiếp vào R2 qua binding (KHÔNG qua S3 API)
      await env.R2_BUCKET.put(key, request.body, {
        httpMetadata: { contentType },
      });

      return Response.json({
        success: true,
        key: key,
        message: `Uploaded ${key} successfully`,
      });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  },
};

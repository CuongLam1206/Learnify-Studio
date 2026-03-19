import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "*.r2.cloudflarestorage.com" },  // R2 private
      { hostname: "*.r2.dev" },                      // R2 public domain
      { hostname: "pub-*.r2.dev" },                  // R2 public bucket URL
      { hostname: "*.cloudflare.com" },
      { hostname: "*.ngrok-free.app" },
      { hostname: "*.loca.lt" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
  async headers() {
    return [
      {
        // Cho phép embed từ learnify.vn
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://learnify.vn https://*.learnify.vn",
          },
          {
            key: "X-Frame-Options",
            value: "ALLOWALL",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

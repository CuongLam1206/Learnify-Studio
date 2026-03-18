import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "*.r2.cloudflarestorage.com" },
      { hostname: "*.cloudflare.com" },
      { hostname: "*.railway.app" },
      { hostname: "*.ngrok-free.app" },
      { hostname: "*.loca.lt" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" },
  },
};

export default nextConfig;

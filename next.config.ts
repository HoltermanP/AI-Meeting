import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Grote audio-bestanden (lange meetings) kunnen 100MB+ zijn
      bodySizeLimit: "200mb",
    },
  },
  // Native binaries / modules die Next NIET moet bundelen
  serverExternalPackages: ["ffmpeg-static"],
  // Forceer dat ffmpeg-binary én Prisma-client in elke Vercel-function meekomen.
  // App Router heeft inconsistente trace-keys, dus dekken we het breed af.
  outputFileTracingIncludes: {
    "/api/meetings/**/*": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/index.js",
      "./node_modules/ffmpeg-static/package.json",
    ],
    "/api/diag/**/*": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/index.js",
      "./node_modules/ffmpeg-static/package.json",
    ],
    "/*": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffmpeg-static/index.js",
      "./node_modules/ffmpeg-static/package.json",
    ],
  },
};

export default nextConfig;

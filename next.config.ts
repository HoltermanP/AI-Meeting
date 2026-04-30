import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Grote audio-bestanden (lange meetings) kunnen 100MB+ zijn
      bodySizeLimit: "200mb",
    },
  },
  // ffmpeg-static levert een binary die NIET door de Next bundler moet worden aangeraakt
  serverExternalPackages: ["ffmpeg-static"],
  // Forceer dat de juiste platform-binary van ffmpeg in de Vercel-function wordt meegebundeld
  outputFileTracingIncludes: {
    "/api/meetings/**": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;

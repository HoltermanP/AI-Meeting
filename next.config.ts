import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Grote audio-bestanden (lange meetings) kunnen 100MB+ zijn
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;

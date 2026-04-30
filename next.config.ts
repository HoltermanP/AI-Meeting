import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Audio-uploads gaan nu via /transcribe-chunk (chunks van ~2 MB), maar
      // we houden ruimte voor andere uploads (bv. Word-templates).
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

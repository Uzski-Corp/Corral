import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The legal pages live at /legal/* (Bau's M10 routes, HANDOFF §18); the short addresses people type redirect there.
  async redirects() {
    return [
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
    ];
  },
};

export default nextConfig;

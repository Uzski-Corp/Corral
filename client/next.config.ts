import type { NextConfig } from "next";
import path from "node:path";

const clientRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // The API and landing worker have their own lockfiles. Trace only this app,
  // keeping standalone/server.js in the same location locally and in Docker.
  outputFileTracingRoot: clientRoot,
  turbopack: { root: clientRoot },
  experimental: {
    // Existing global styles depend on theme/base/override import order.
    cssChunking: "strict",
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // The legal pages live at /legal/* (Bau's M10 routes, HANDOFF §18); the short addresses people type redirect there.
  async redirects() {
    return [
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
    ];
  },
};

export default nextConfig;

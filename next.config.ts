import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [
      {
        // All API routes: allow Vercel frontend origin
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "https://nuldam-content.vercel.app" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
      {
        // File serving: override with wildcard origin (images/videos loaded cross-origin by <img>/<video> tags)
        source: "/api/files/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Range" },
        ],
      },
    ];
  },
};

export default nextConfig;

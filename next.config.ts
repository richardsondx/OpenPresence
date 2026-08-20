import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.OPENPRESENCE_NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["better-sqlite3", "playwright", "@playwright/test", "playwright-core"],
};

export default nextConfig;

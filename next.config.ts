import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.OPENPRESENCE_NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["better-sqlite3", "playwright", "@playwright/test", "playwright-core"],
  webpack: (config) => {
    // Local SQLite WAL/SHM files are high-frequency runtime data. Watching
    // them makes Next dev invalidate and rebuild the app while the Bridge
    // heartbeats, which can starve every request under active observation.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/data/**", "**/.next*/**"],
    };
    return config;
  },
};

export default nextConfig;

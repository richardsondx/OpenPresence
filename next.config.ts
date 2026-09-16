import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // Keep local runtime controls from covering the mobile navigation dock.
  devIndicators: false,
  distDir: process.env.OPENPRESENCE_NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["better-sqlite3", "playwright", "@playwright/test", "playwright-core"],
  ...(process.env.OPENPRESENCE_USE_TURBO === "1" ? {} : {
    webpack: (config: Parameters<NonNullable<NextConfig["webpack"]>>[0]) => {
      // Local SQLite WAL/SHM files are high-frequency runtime data. Watching
      // them makes Next dev invalidate and rebuild the app while the Bridge
      // heartbeats, which can starve every request under active observation.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ["**/data/**", "**/.next*/**"],
      };
      return config;
    },
  }),
};

export default nextConfig;

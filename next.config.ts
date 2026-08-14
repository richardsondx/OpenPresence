import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.OPENPRESENCE_NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;

import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Turbopack scoped to this repository even when a parent directory
  // happens to contain another lockfile.
  turbopack: { root: process.cwd() },
};
export default nextConfig;

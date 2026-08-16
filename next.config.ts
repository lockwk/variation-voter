import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["jsdom", "isomorphic-dompurify"],
};

export default nextConfig;

import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@gallery/core"],
  experimental: { viewTransition: true },
  env: { CONTENT_SOURCE: process.env.CONTENT_SOURCE ?? "" },
};

export default config;

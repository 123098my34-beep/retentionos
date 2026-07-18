/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hiro/shared", "convex"],
  outputFileTracingRoot: process.cwd() + "/../..",
};

export default nextConfig;

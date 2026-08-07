/** @type {import('next').NextConfig} */
const nextConfig = {
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  experimental: {
    // Posts are read from the filesystem at build time.
    optimizePackageImports: ['@gate/ui'],
  },
};

export default nextConfig;

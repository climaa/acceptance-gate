/** @type {import('next').NextConfig} */
const nextConfig = {
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  experimental: {
    // Posts are read from the filesystem at build time.
    optimizePackageImports: ['@gate/ui'],
  },
  // /sobre-mi was a published, nav-linked URL before the route segment was
  // translated. Renaming the directory alone would start 404ing it.
  async redirects() {
    return [{ source: '/sobre-mi', destination: '/about', permanent: true }];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  experimental: {
    // Posts are read from the filesystem at build time.
    optimizePackageImports: ['@gate/ui'],
  },
  // Every card for a known slug is prerendered, but /blog/<unknown>/opengraph-image
  // stays reachable and renders on demand — and it reads the display face with
  // `readFile` off a path no bundler can follow statically. Name the file so the
  // deployed function ships the bytes instead of 500ing on the first such request.
  outputFileTracingIncludes: {
    '/blog/[slug]/opengraph-image': [
      './node_modules/@gate/ui/src/fonts/og/Fraunces9pt-SemiBold.ttf',
    ],
  },
  // /sobre-mi was a published, nav-linked URL before the route segment was
  // translated. Renaming the directory alone would start 404ing it.
  async redirects() {
    return [{ source: '/sobre-mi', destination: '/about', permanent: true }];
  },
};

export default nextConfig;

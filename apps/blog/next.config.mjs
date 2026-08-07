/** @type {import('next').NextConfig} */
const nextConfig = {
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  experimental: {
    // Posts are read from the filesystem at build time.
    optimizePackageImports: ['@gate/ui'],
  },
  // A post's filename IS its slug (lib/posts.ts derives it by stripping the
  // extension), so renaming a file rewrites a published URL. These two posts
  // were live under Spanish slugs before the repo was standardised on English;
  // without these, both would start returning 404.
  //
  // Only previously-published slugs belong here. A post renamed before it ever
  // shipped needs no entry.
  async redirects() {
    return [
      {
        source: '/blog/gherkin-specs-que-sobreviven',
        destination: '/blog/gherkin-specs-that-survive',
        permanent: true,
      },
      {
        source: '/blog/regresion-visual-con-agentes',
        destination: '/blog/visual-regression-with-agents',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

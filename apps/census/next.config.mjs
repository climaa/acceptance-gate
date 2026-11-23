/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every route prerenders, and this flag makes that a build-time check rather
  // than an assumption: the pages are built from `measurement.json` and
  // `history.json`, read on the builder through `lib/committed.ts`, and a route
  // that went dynamic would read them in a function bundle that does not ship
  // them. The same reasoning apps/manual records for its `.feature` files.
  cacheComponents: true,
  // Deliberately NOT `typedRoutes`: the design system's `Link` collapses
  // next/link's route type parameter to `unknown` (apps/visual-diff-ui records
  // why at length), so the flag could only be satisfied with casts.
  // The design system and the logger ship as uncompiled TypeScript.
  transpilePackages: ['@gate/logger', '@gate/ui'],
  // The pages regenerate about daily (app/home-view.ts) and re-read the files
  // when it does, off a path no bundler can follow, so name them.
  outputFileTracingIncludes: {
    '/': ['./measurement.json', './history.json'],
    '/[workspace]': ['./measurement.json'],
  },
  experimental: {
    optimizePackageImports: ['@gate/ui'],
  },
};

export default nextConfig;

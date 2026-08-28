/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every route here is built from the filesystem, so the whole site is
  // prerenderable and nothing reads request data. The flag makes that a checked
  // property rather than a description: a route that starts reading cookies or
  // headers fails the build instead of quietly becoming dynamic.
  cacheComponents: true,
  // A link warms the shared App Shell rather than its whole destination, so the
  // index stops prefetching a full payload per post and per tag chip. Adopted
  // with no per-link exceptions: nothing here passes `prefetch`, so no link was
  // relying on the old behaviour of fetching everything ahead of the click.
  partialPrefetching: true,
  // Every `href` in this app is a literal, and the design system forwards its
  // `as` target's own props (packages/ui/src/atoms/Link/Link.tsx), so
  // `<Link as={NextLink} href="/blog">` is checked against the route tree even
  // though `@gate/ui` never imports next. Free here: the flag costs this app no
  // casts at all. apps/visual-diff-ui declines it, and says there why.
  typedRoutes: true,
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/logger', '@gate/ui'],
  // Defined so it can be ELIMINATED. Next inlines a `NEXT_PUBLIC_*` read only
  // when the variable exists; an absent one is left as a live `process.env`
  // lookup, so `instrumentation-client.ts`'s DSN guard stays a runtime branch
  // and the `@sentry/browser` chunk behind its dynamic import is loaded on
  // every page — 438 KB, measured, to decide not to report. Normalising unset
  // to `''` makes the guard `if ('')`, which the bundler drops along with the
  // import, the chunk, and the instrumentation entry itself.
  env: { NEXT_PUBLIC_BUGSINK_DSN: process.env.NEXT_PUBLIC_BUGSINK_DSN ?? '' },
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

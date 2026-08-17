/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every read here is a filesystem read of a directory chosen at request time,
  // so the flag is what keeps that honest: data resolved outside a `use cache`
  // scope becomes a dynamic hole instead of being baked into the prerender, and
  // a route that starts reading cookies or headers fails the build.
  cacheComponents: true,
  // Deliberately NOT `partialPrefetching`, which apps/blog enables. That flag
  // pays off on an index that links to many distinct destinations; this app has
  // two routes, and everything worth prefetching on the console is already the
  // shared shell. Revisit when the report route gains links of its own.

  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  // Every route below reads `fixtures/` with `readFile` at request time, off a
  // path no bundler follows statically — the same trap apps/blog documents for
  // its OG display face. Without naming the files, the deployed function ships
  // without them and 500s on the first request instead of falling back to
  // sample mode. `/api/env` is absent on purpose: it reads no data directory.
  outputFileTracingIncludes: {
    '/': ['./fixtures/**'],
    '/report/[id]': ['./fixtures/**'],
    '/api/sets': ['./fixtures/**'],
    '/api/reports': ['./fixtures/**'],
    '/api/reports/[id]': ['./fixtures/**'],
    '/api/shots/[report]/[file]': ['./fixtures/**'],
  },
};

export default nextConfig;

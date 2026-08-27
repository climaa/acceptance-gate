/** @type {import('next').NextConfig} */
const nextConfig = {
  // Every read here is a filesystem read of a directory chosen at request time,
  // so the flag is what keeps that honest: data resolved outside a `use cache`
  // scope becomes a dynamic hole instead of being baked into the prerender, and
  // a route that starts reading cookies or headers fails the build.
  cacheComponents: true,
  // Deliberately NOT `typedRoutes`, which apps/blog enables and gets for free.
  // It works through the design system's `as` indirection for a literal href —
  // `href="/nope"` is caught — but not for a computed one. `Link` forwards
  // `ComponentPropsWithoutRef<E>`, and that collapses next/link's own route type
  // parameter to `unknown`, so the checked type becomes `RouteImpl<unknown>`:
  // satisfiable by a string literal, and by no template literal at all. Every
  // link into a report is `` `/report/${id}` ``, so the flag rejects three
  // correct hrefs, and `router.replace` builds its URL from `pathname` + query
  // in three more places. Six `as Route` casts, half of them on code that is
  // right — the tool would be asserting less here than it costs to silence.
  // Deliberately NOT `partialPrefetching`, which apps/blog enables. That flag
  // pays off on an index that links to many distinct destinations; this app has
  // two routes, and everything worth prefetching on the console is already the
  // shared shell. Revisit when the report route gains links of its own.

  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/logger', '@gate/ui'],
  // The differ runs, it does not get bundled. Two reasons, both fatal to a
  // built server that tries: `commands.mjs` derives its repo root from
  // `new URL('../../..', import.meta.url)`, which the bundler reads as an asset
  // import and cannot resolve, and `capture.mjs` reaches for `playwright`, a
  // dependency of that package rather than of this app. Required at runtime,
  // both are just what they are on disk. Verified against a production build:
  // `POST /api/jobs` compare writes its report and exits 1.
  serverExternalPackages: ['@gate/visual-diff'],
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

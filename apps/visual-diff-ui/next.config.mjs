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
  // Defined so it can be ELIMINATED. Next inlines a `NEXT_PUBLIC_*` read only
  // when the variable exists; an absent one is left as a live `process.env`
  // lookup, so `instrumentation-client.ts`'s DSN guard stays a runtime branch
  // and the `@sentry/browser` chunk behind its dynamic import is loaded on
  // every page — 438 KB, measured, to decide not to report. Normalising unset
  // to `''` makes the guard `if ('')`, which the bundler drops along with the
  // import, the chunk, and the instrumentation entry itself.
  env: { NEXT_PUBLIC_BUGSINK_DSN: process.env.NEXT_PUBLIC_BUGSINK_DSN ?? '' },
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
    // The tile maps too: the comparison and the shot view read them on the
    // server to open a variant on the board that draws it (lib/board-homes.ts),
    // and the bracketed keys below were measured to match nothing.
    '/': ['./fixtures/**', '../../designs/exports/*.tiles.json'],
    '/report/[id]': ['./fixtures/**'],
    '/report/[id]/compare/[key]': ['./fixtures/**'],
    '/report/[id]/@modal/(.)compare/[key]': ['./fixtures/**'],
    // The card reads the shots like the page does, and the display face off a
    // path no bundler can follow statically — see lib/og.tsx.
    '/report/[id]/compare/[key]/opengraph-image': [
      './fixtures/**',
      '../../packages/ui/src/fonts/og/Fraunces9pt-SemiBold.ttf',
    ],
    // The site card reads only the display face, off its real path — lib/og.tsx.
    '/og/site.png': ['../../packages/ui/src/fonts/og/Fraunces9pt-SemiBold.ttf'],
    '/api/sets': ['./fixtures/**'],
    '/api/reports': ['./fixtures/**'],
    '/api/reports/[id]': ['./fixtures/**'],
    '/api/label': ['./fixtures/**'],
    '/api/shots/[report]/[file]': ['./fixtures/**'],
    '/set/[label]': ['./fixtures/**'],
    '/api/sets/[label]/shots/[file]': ['./fixtures/**'],
    // No brackets in the key, on purpose: these keys are globs, and a bracketed
    // one was measured to match no route at all. The boards are read off their
    // real path by the route — see app/api/designs/route.ts.
    '/api/designs': ['../../designs/exports/*.png', '../../designs/exports/*.json'],
  },
};

export default nextConfig;

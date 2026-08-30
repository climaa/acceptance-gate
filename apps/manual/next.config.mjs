/** @type {import('next').NextConfig} */
const nextConfig = {
  // Load-bearing here rather than merely tidy. Every page is built by reading
  // `.feature` files that live outside this workspace, in `apps/e2e`. That is
  // safe only while every route prerenders: the read happens on the builder,
  // where the whole monorepo is checked out, and nothing has to ship in a
  // function bundle. A route that started reading request data would go dynamic
  // and then 500 in production on a path no bundler can trace. This flag turns
  // "everything prerenders" from an assumption into a build-time check.
  cacheComponents: true,
  partialPrefetching: true,
  // Deliberately NOT `typedRoutes`, for the reason apps/visual-diff-ui records
  // at length: the design system's `Link` forwards `ComponentPropsWithoutRef<E>`,
  // which collapses next/link's route type parameter to `unknown`, so the
  // checked type is `RouteImpl<unknown>` — satisfiable by a literal href and by
  // no template literal at all. Every link in this app is `` `/${slug}` `` into
  // the one dynamic segment, so the flag rejects all three and the only way to
  // pass is a cast at every call site. A cast is not a check.
  //
  // The slugs are guarded anyway, and better: they come from one array that
  // `generateStaticParams` and `findManualPage` both read, and `sync.test.ts`
  // asserts each one resolves to a feature that parses.
  // The design system ships as uncompiled TypeScript (source-direct).
  transpilePackages: ['@gate/ui'],
  experimental: {
    optimizePackageImports: ['@gate/ui'],
  },
};

export default nextConfig;

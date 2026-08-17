/**
 * `next/cache` under vitest, where there is no Next build to declare against.
 *
 * `cacheLife()` reads the compiled `cacheComponents` config and throws without
 * it, so importing any module that declares a cache profile — lib/data.ts, and
 * every route handler through it — fails at import time rather than in an
 * assertion. Neither call has runtime behaviour to assert: they annotate a
 * `"use cache"` scope for the compiler, and the directive itself is inert here
 * because esbuild leaves the string literal alone.
 *
 * `cacheTag` is stubbed alongside it — unlike apps/blog, every cached reader in
 * this app tags itself, so a suite without it could not import lib/data.ts at
 * all. The tag is a registration for a later `revalidateTag`, which nothing in
 * this suite calls, so recording it would only assert the stub.
 *
 * Nothing else is stubbed, deliberately: anything else imported from
 * `next/cache` arrives as `undefined` and fails loudly, because `revalidateTag`
 * and friends DO have behaviour worth deciding about rather than no-opping.
 */
export function cacheLife(_profile: string): void {}

export function cacheTag(..._tags: string[]): void {}

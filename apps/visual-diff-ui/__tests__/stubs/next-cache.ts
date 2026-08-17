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
 * all. The tag is a registration for a later `revalidateTag`, so recording it
 * would only assert the stub.
 *
 * `revalidateTag` is the one export here that IS recorded, because it is the one
 * with behaviour this suite asserts: every mutation this app performs ends by
 * refreshing the lists a reviewer is looking at, and "the console reflects the
 * mutation without a rebuild" is not observable from the filesystem. Reading
 * `revalidateTagCalls` is how a test sees it; clear it between tests.
 *
 * `updateTag` is deliberately NOT stubbed, and nothing in this app may call it:
 * it is Server-Action-only, and from a route handler Next throws — answering 500
 * for a delete that already happened. `__tests__/config.test.ts` is what holds
 * that shut, since a stub here would have hidden it.
 */
export function cacheLife(_profile: string): void {}

export function cacheTag(..._tags: string[]): void {}

/** Every tag passed to {@link revalidateTag}, in call order. The window beside
 *  it is one value for this whole app (`PURGE` in lib/data.ts), so recording it
 *  per call would assert the constant rather than the invalidation. */
export const revalidateTagCalls: string[] = [];

export function revalidateTag(tag: string, _window: string | { expire: number }): void {
  revalidateTagCalls.push(tag);
}

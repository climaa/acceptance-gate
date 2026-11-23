/**
 * `next/cache` under vitest, where there is no Next build to declare against.
 *
 * `cacheLife()` reads the compiled `cacheComponents` config and throws without
 * it, so importing any module that declares a cache profile — lib/og.tsx —
 * fails at import time rather than in an assertion. The same stub as
 * `apps/blog/__tests__/stubs/next-cache.ts`, for the same reason.
 * The call has no runtime behaviour to assert: it annotates a `"use cache"`
 * scope for the compiler, and the directive itself is inert here because
 * the transform leaves the string literal alone.
 *
 * Only `cacheLife` is stubbed, deliberately. Anything else imported from
 * `next/cache` in a test arrives as `undefined` and fails loudly, because
 * `cacheTag`/`revalidateTag` DO have behaviour worth deciding about rather
 * than silently no-opping.
 */
export function cacheLife(_profile: string): void {}

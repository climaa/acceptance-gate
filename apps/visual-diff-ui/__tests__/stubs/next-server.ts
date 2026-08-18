/**
 * `next/server` under vitest, where nothing is rendering and no request exists.
 *
 * `connection()` is how this app says "resolve the data directory at request
 * time, never at build time" (see lib/data.ts). Outside a Next render it throws,
 * so every module reaching for it — lib/data.ts and each route handler — would
 * fail on import. Awaiting nothing is the honest stand-in: the call marks a
 * prerender boundary for the compiler and carries no value of its own.
 *
 * Only that one export, for the same reason the `next/cache` stub is minimal:
 * `NextRequest`/`NextResponse` have behaviour, and a silent `undefined` would
 * hide the moment a handler starts depending on it.
 */
export async function connection(): Promise<void> {}

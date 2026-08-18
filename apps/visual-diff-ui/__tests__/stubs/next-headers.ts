/**
 * `next/headers` under vitest, where there is no request.
 *
 * `POST /api/jobs` asks the request which host it arrived on, because that is
 * the whole of the local gate (lib/local.ts). Under vitest the route is called
 * as a plain function, so there is no header set to read and the real `headers()`
 * throws outside a request scope.
 *
 * The host is module state rather than an argument for the same reason
 * `setSearchParams` is: it is a property of the request, and a test drives it the
 * way the platform would. It defaults to a loopback address, so every suite that
 * has nothing to say about the gate reads as the local console it is testing.
 *
 * Only `headers()` is stubbed. `cookies()` and `draftMode()` have behaviour worth
 * deciding about rather than faking, and an `undefined` import fails loudly the
 * moment something reaches for one.
 */

const DEFAULT_HOST = 'localhost:3300';

let host: string | null = DEFAULT_HOST;

/** The `Host` this render or request arrived with. `null` stands for a request
 *  that carried none, which the gate reads as "not local". */
export function setRequestHost(value: string | null): void {
  host = value;
}

/** Back to a local console — call it between tests, the way the other stubs are
 *  cleared, so one deployed-console case cannot leak into the next suite. */
export function resetRequestHost(): void {
  host = DEFAULT_HOST;
}

export function headers(): Promise<{ get(name: string): string | null }> {
  return Promise.resolve({
    get: (name: string) => (name.toLowerCase() === 'host' ? host : null),
  });
}

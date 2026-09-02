/**
 * `next/headers` under vitest, where there is no request.
 *
 * `guardMutation` asks the request four questions and reads three headers to
 * answer them: where it came from (`Sec-Fetch-Site`, falling back to `Origin`),
 * what it is carrying (`Content-Type`), and which address it arrived on
 * (`Host`). Under vitest a route is called as a plain function, so there is no
 * header set to read and the real `headers()` throws outside a request scope.
 *
 * The headers are module state rather than an argument for the same reason
 * `setSearchParams` is: they are properties of the request, and a test drives
 * them the way the platform would.
 *
 * The defaults are what a browser on the console's own pages sends: a loopback
 * address, and `Sec-Fetch-Site: same-origin`. Every suite that has nothing to
 * say about the gate therefore reads as the local console it is testing. No
 * `Content-Type` is defaulted — a browser sends one only when it is sending a
 * body, and the guard reads its absence the same way.
 *
 * Only `headers()` is stubbed. `cookies()` and `draftMode()` have behaviour worth
 * deciding about rather than faking, and an `undefined` import fails loudly the
 * moment something reaches for one.
 */

const DEFAULTS: Readonly<Record<string, string>> = {
  host: 'localhost:3300',
  'sec-fetch-site': 'same-origin',
};

let sent: Record<string, string | null> = { ...DEFAULTS };

/** Whatever this request carried, over the defaults. `null` stands for a header
 *  it did not carry at all — which is a different case from every one of these
 *  headers, and the case each of them has to decide about. */
export function setRequestHeaders(carried: Record<string, string | null>): void {
  for (const [name, value] of Object.entries(carried)) sent[name.toLowerCase()] = value;
}

/** The `Host` this render or request arrived with. `null` stands for a request
 *  that carried none, which the gate reads as "not local". */
export function setRequestHost(value: string | null): void {
  setRequestHeaders({ host: value });
}

/** Back to a browser on the console's own pages — call it between tests, the way
 *  the other stubs are cleared, so one deployed-console case cannot leak into
 *  the next suite. */
export function resetRequestHeaders(): void {
  sent = { ...DEFAULTS };
}

export function headers(): Promise<{ get(name: string): string | null }> {
  return Promise.resolve({
    get: (name: string) => sent[name.toLowerCase()] ?? null,
  });
}

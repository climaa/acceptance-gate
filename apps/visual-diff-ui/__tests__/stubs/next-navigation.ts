/**
 * `next/navigation` under vitest, where there is no router and no URL bar.
 *
 * `useRouter()` throws outside a Next render, so the console's client islands —
 * the compare pickers, the run panel, the current-job region — could not be
 * rendered at all without this. The router IS what two of those contracts are
 * about: clicking `compare A ⇄ B` writes the two labels into the URL and the run
 * panel reads them back from there, and a job that has just finished refreshes
 * the server-rendered tables around it. Recording the calls is how a test sees
 * both seams.
 *
 * `usePathname()` answers `/`, the route the console is served at, so the
 * asserted URL is the one a reviewer would actually be sent to.
 *
 * Nothing else is stubbed: `redirect` and friends have behaviour worth deciding
 * about rather than faking, and an `undefined` import fails loudly the moment
 * something reaches for one.
 */

export interface NavigationOptions {
  scroll?: boolean;
}

export interface RouterCall {
  url: string;
  options?: NavigationOptions;
}

/** Every `router.replace` this render performed, in call order. Clear it between tests. */
export const replaceCalls: RouterCall[] = [];

/** Every `router.refresh()` — one entry per call, since a refresh carries no
 *  arguments and it is how many times the console re-read the server that a
 *  test has anything to say about. Clear it between tests. */
export const refreshCalls: 'refresh'[] = [];

export function useRouter() {
  return {
    replace(url: string, options?: NavigationOptions): void {
      replaceCalls.push({ url, options });
    },
    refresh(): void {
      refreshCalls.push('refresh');
    },
  };
}

export function usePathname(): string {
  return '/';
}

let params = new URLSearchParams();

/** The query string this render is served with. Set it before rendering — the
 *  compare pre-fill is a URL contract, so a test drives it the same way the
 *  pickers do: by writing the params the panel reads back. */
export function setSearchParams(query: string): void {
  params = new URLSearchParams(query);
}

export function useSearchParams(): URLSearchParams {
  return params;
}

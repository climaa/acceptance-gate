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
 * asserted URL is the one a reviewer would actually be sent to — unless a test
 * moves it, which the report does to say a comparison is open over it.
 *
 * `notFound()` is stubbed too, because its whole behaviour is one fact a server
 * component's test asserts: it throws, and nothing after it renders. Nothing
 * else is: `redirect` and the rest have behaviour worth deciding about rather
 * than faking, and an `undefined` import fails loudly the moment something
 * reaches for one.
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

/** Every `router.push` this render performed, in call order. Clear it between tests. */
export const pushCalls: string[] = [];

/** Every `router.back()`. Clear it between tests. */
export const backCalls: 'back'[] = [];

/** Every `router.refresh()` — one entry per call, since a refresh carries no
 *  arguments and it is how many times the console re-read the server that a
 *  test has anything to say about. Clear it between tests. */
export const refreshCalls: 'refresh'[] = [];

/** Every `router.prefetch` this render performed, in call order. Clear it between tests. */
export const prefetchCalls: string[] = [];

export function useRouter() {
  return {
    replace(url: string, options?: NavigationOptions): void {
      replaceCalls.push({ url, options });
    },
    push(url: string): void {
      pushCalls.push(url);
    },
    back(): void {
      backCalls.push('back');
    },
    refresh(): void {
      refreshCalls.push('refresh');
    },
    prefetch(url: string): void {
      prefetchCalls.push(url);
    },
  };
}

let pathname = '/';

/** The route this render is served at. Reset it to `/` after a test that moves it. */
export function setPathname(next: string): void {
  pathname = next;
}

export function usePathname(): string {
  return pathname;
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

/** What `notFound()` throws here, so a test can tell it from any other throw. */
export const NOT_FOUND = 'NEXT_NOT_FOUND';

/** Throws {@link NOT_FOUND} — see the header for why this one is stubbed. */
export function notFound(): never {
  throw new Error(NOT_FOUND);
}

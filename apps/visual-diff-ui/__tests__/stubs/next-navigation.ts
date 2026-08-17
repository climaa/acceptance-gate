/**
 * `next/navigation` under vitest, where there is no router and no URL bar.
 *
 * `useRouter()` throws outside a Next render, so the compare pickers — the
 * console's one client island — could not be rendered at all without this. The
 * router IS what that component's contract is about: clicking `compare A ⇄ B`
 * writes the two labels into the URL, and the run panel reads them back from
 * there. Recording the calls is how a test sees the seam.
 *
 * `usePathname()` answers `/`, the route the console is served at, so the
 * asserted URL is the one a reviewer would actually be sent to.
 *
 * Nothing else is stubbed: `useSearchParams`, `redirect` and friends have
 * behaviour worth deciding about rather than faking, and an `undefined` import
 * fails loudly the moment something reaches for one.
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

export function useRouter() {
  return {
    replace(url: string, options?: NavigationOptions): void {
      replaceCalls.push({ url, options });
    },
  };
}

export function usePathname(): string {
  return '/';
}

import { OPT_OUT_KEY } from '@gate/logger/analytics';

/**
 * Keeps every browser this suite drives out of Vercel Web Analytics.
 *
 * Against the servers the suite boots itself, nothing is at stake: the beacon
 * renders only under `VERCEL_ENV === 'production'`, which a local `next start`
 * never sets. The exposure is `E2E_BASE_URL` — a local override that aims the
 * whole suite at a deployment, and on `*.carloslima.dev` every scenario would
 * then be a page view in the live dashboard, indistinguishable from a reader.
 *
 * Two layers, because either alone has a way to miss:
 *   - the beacon's requests are aborted before they leave the browser. Matched
 *     by shape rather than by one path: the package's fallback is
 *     `/_vercel/insights/*`, but a deployment injects a per-project prefix
 *     (`/<16 hex>/script.js`, `/<16 hex>/view`), and a route on the fallback
 *     alone would let that one through;
 *   - the owner's opt-out flag is in `localStorage` before any page script runs —
 *     the flag `?va-disable=1` sets, read by `optOutBeforeSend` in
 *     `@gate/logger/analytics`. An event the route misses is still dropped.
 *
 * And a tripwire behind both: a beacon request that completes — answered rather
 * than aborted — is reported, so the run fails instead of counting quietly.
 *
 * Out of reach: `page.request` / `request` calls (an APIRequestContext) bypass
 * `context.route`. They fetch without running a page's scripts, so they never
 * load the beacon — `about.ts` and `link-preview.ts` rely on exactly that.
 *
 * The two beacon paths below are copied from `@vercel/analytics`; when it is
 * bumped, re-check them beside `apps/storybook/.storybook/analytics-head.ts`.
 */

/** The package's fallback path, used when no client config is injected. */
const FALLBACK_BEACON = /\/_vercel\/insights\//;

/** The per-project path a Vercel deployment injects in its place. */
const PROJECT_BEACON = /^\/[0-9a-f]{16}\/(?:script\.js|view|event|session)$/;

/** Whether a URL is one of the analytics beacon's requests. */
export function isAnalyticsBeacon(url: string | URL): boolean {
  const { pathname } = typeof url === 'string' ? new URL(url) : url;

  return FALLBACK_BEACON.test(pathname) || PROJECT_BEACON.test(pathname);
}

/** The slice of a Playwright `Request` the tripwire reads. */
type ObservedRequest = { url(): string };

/** The slice of a Playwright `BrowserContext` the guard touches. Declared here
 *  rather than imported, so a test double states exactly what it must provide. */
export type GuardedContext = {
  route(
    url: (url: URL) => boolean,
    handler: (route: { abort(): Promise<void> }) => Promise<void>,
  ): Promise<unknown>;
  addInitScript(script: (key: string) => void, key: string): Promise<unknown>;
  on(event: 'requestfinished', listener: (request: ObservedRequest) => void): unknown;
};

/** Stores the opt-out flag. Runs in the page, so it closes over nothing and is
 *  handed the key as its argument; a page with no storage is left as it is. */
function storeOptOut(key: string) {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Sandboxed or storage-blocked: the route still aborts the beacon.
  }
}

/**
 * Installs both layers and the tripwire on one browser context.
 *
 * @returns the beacon URLs that got through. Empty is the only passing value.
 */
export async function guardAnalytics(context: GuardedContext): Promise<() => string[]> {
  const leaked: string[] = [];

  await context.route(isAnalyticsBeacon, (route) => route.abort());
  await context.addInitScript(storeOptOut, OPT_OUT_KEY);
  context.on('requestfinished', (request) => {
    if (isAnalyticsBeacon(request.url())) leaked.push(request.url());
  });

  return () => [...leaked];
}

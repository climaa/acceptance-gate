/**
 * How long a request from this console waits for the server before giving up.
 *
 * `fetch` has no timeout of its own. On a connection that drops packets without
 * closing — a train, a VPN reconnecting — a request neither lands nor fails, and
 * everything waiting on it waits forever: a confirm button stays busy, and the
 * job poller, which only schedules its next poll once this one returns, stops
 * polling for good.
 *
 * Thirty seconds is generous on purpose. The console is opened from a phone over
 * a slow link, and a limit tight enough to be felt on a good connection would
 * fail requests that were only slow.
 */
export const NETWORK_TIMEOUT_MS = 30_000;

/** What a request that ran out of time rejects with, so a caller can tell it
 *  from a request that was refused outright. */
export class NetworkTimeout extends Error {
  override name = 'NetworkTimeout';

  constructor(url: string) {
    super(`no answer from ${url} within ${NETWORK_TIMEOUT_MS / 1000}s`);
  }
}

export const isNetworkTimeout = (error: unknown): boolean =>
  error instanceof NetworkTimeout || (error as Error | null)?.name === 'NetworkTimeout';

/**
 * `fetch`, bounded by {@link NETWORK_TIMEOUT_MS}.
 *
 * The timer is not cleared when the headers arrive. It also bounds reading the
 * body, which is where a stalled connection hangs just as often. Aborting a
 * response that has already been read does nothing.
 */
export function fetchWithin(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new NetworkTimeout(url)), NETWORK_TIMEOUT_MS);

  return fetch(url, { ...init, signal: controller.signal });
}

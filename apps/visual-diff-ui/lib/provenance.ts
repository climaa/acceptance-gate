import { NOT_JSON, NOT_SAME_ORIGIN } from './refusal-copy';

/**
 * Who asked for this mutation, and what they are handing it.
 *
 * The `Host` gate next door (lib/local.ts) answers which ADDRESS a request
 * arrived on. That is a different question, and on its own it is not one a
 * browser can be trusted with: a cross-origin `POST` carrying
 * `Content-Type: text/plain` is a CORS-simple request, so it is sent with no
 * preflight and no `Access-Control-*` header needed, and the browser attaches
 * the console's own `Host` because that is the address it is posting to. Every
 * question the guard used to ask therefore answered "yes" for a page the
 * reviewer merely had open in another tab — one `POST /api/prune` with
 * `{"keep":0}` away from every capture set on the machine.
 *
 * Two questions close that, in this order:
 *
 *  1. `Sec-Fetch-Site`, which the browser states and a page cannot forge. Only
 *     `same-origin` and `none` are this console: `none` is the address bar, with
 *     no page behind the request at all. `same-site` is refused with
 *     `cross-site`, because every port on localhost shares one registrable
 *     domain — the blog's dev server is `same-site` to this console and is not
 *     this console. `Origin` is the fallback, and only when the header is
 *     absent, so a client too old to send it is not locked out.
 *  2. The body's own content type, but only when there is a body. `DELETE
 *     /api/reports/[id]` and `DELETE /api/sets/[label]` send none — and were
 *     never reachable cross-origin anyway, because a `DELETE` forces a preflight
 *     and nothing in this repo answers one — so a blanket check would refuse two
 *     routes to fix two others.
 *
 * WHAT THIS DOES NOT CLOSE, said plainly rather than implied: a request stating
 * neither header passes. `curl` is such a client, so
 * `curl -H 'Host: localhost' -X POST http://<lan-ip>:3300/api/prune` is not
 * answered here. What answers it is binding the dev server to loopback —
 * `next dev -H 127.0.0.1` in this workspace's package.json — which is the other
 * half of this fix and the half that actually closes that door. Refusing
 * absent-both instead would lock out every non-browser client in order to catch
 * an attacker who need only omit a header, and would buy nothing the bind has
 * not already bought outright.
 *
 * A browser cannot omit both. `fetch` and `XMLHttpRequest` always set `Origin`
 * on a cross-origin request, form submissions have set it for years, and every
 * current engine sends `Sec-Fetch-Site` on everything. The pass above therefore
 * describes a client that is not a browser, and the CSRF this exists to stop
 * needs one.
 *
 * Deliberately a leaf, like lib/local.ts: it reads headers it is handed and
 * touches nothing else, so `guardMutation` can ask it before it reads the disk.
 */

/** Enough of `next/headers`' answer to read one header out of it, so this stays
 *  testable without a request and without `next/headers` in its own imports. */
export interface RequestHeaders {
  get(name: string): string | null;
}

/** The two `Sec-Fetch-Site` values that mean this console asked itself. */
const OWN_PAGES = new Set(['same-origin', 'none']);

/** The one media type a mutation body may arrive as, and nothing but it: the
 *  parameters after it are not the media type, so `application/json;
 *  charset=utf-8` is the same body spelled out, while `application/jsonp` is a
 *  different one that must not pass by prefix. */
const JSON_MEDIA = /^application\/json\s*(?:;|$)/i;

/**
 * Why this request may not mutate anything, or null when nothing is wrong with
 * where it came from.
 *
 * A sentence rather than a boolean, because the two answers are different
 * refusals and a reader gets told which: one is about the site, the other about
 * the body.
 */
export function provenanceRefusal(head: RequestHeaders): string | null {
  if (!fromOwnPages(head)) return NOT_SAME_ORIGIN;
  if (!bodyIsJson(head)) return NOT_JSON;

  return null;
}

/** Whether the browser says this came from the console's own pages — or, absent
 *  that, whether the `Origin` it did send is the address it is posting to. */
function fromOwnPages(head: RequestHeaders): boolean {
  const site = head.get('sec-fetch-site');
  if (site) return OWN_PAGES.has(site.trim().toLowerCase());

  const origin = head.get('origin');
  // Neither header: the pass argued for above, which the loopback bind answers.
  if (!origin) return true;

  return originMatchesHost(origin, head.get('host'));
}

/** Whether that `Origin` names the same host:port the request arrived on. A
 *  request with no `Host` is nobody's origin — the same failing-closed
 *  `isLocalHost` does, for the same reason. */
function originMatchesHost(origin: string, host: string | null): boolean {
  if (!host) return false;

  try {
    return new URL(origin).host.toLowerCase() === host.trim().toLowerCase();
  } catch {
    // `Origin: null` — a sandboxed iframe, some redirect chains — and anything
    // else that is not a URL. It names no host, so it matches none.
    return false;
  }
}

/** Whether the body, if there is one, is JSON. No `Content-Type` is no body: a
 *  browser sends one whenever it sends bytes, so its absence is the browser's
 *  own statement that there are none. */
function bodyIsJson(head: RequestHeaders): boolean {
  const type = head.get('content-type');
  if (type === null) return true;

  return JSON_MEDIA.test(type.trim());
}

/**
 * The owner's own page views, kept out of Vercel Web Analytics.
 *
 * A UTM tag cannot do this: it labels a visit, it does not exclude one, and the
 * Hobby plan does not even break the dashboard down by it. What the vendor does
 * offer is `beforeSend` — return `null` and the event is never sent — and its
 * documented pattern for "not me" is a flag in `localStorage`.
 *
 * Setting that flag by hand in DevTools, once per subdomain and per browser, is
 * the step nobody repeats on a phone. So the flag is also set from the URL:
 *
 *   ?va-disable=1   remember this browser as the owner's, on this origin
 *   ?va-disable=0   forget it again
 *
 * Opening one bookmarked link per surface is the whole setup. The visit that
 * carries the parameter is itself dropped (`1`) or reported without it (`0`),
 * so the parameter never reaches the dashboard as a page of its own.
 *
 * SELF-CONTAINED ON PURPOSE. apps/storybook inlines this function into its
 * manager's HTML via `.toString()`, where it is re-parsed in an empty scope.
 * So it closes over nothing — the key is a literal, repeated, rather than a
 * module constant — it never throws, and its source never contains `</script`.
 * `OPT_OUT_KEY` below exists for tests and docs to name the key, not for this
 * function to read.
 */

/** The `localStorage` key, and the query parameter that sets it. */
export const OPT_OUT_KEY = 'va-disable';

/** The two `Storage` methods this touches. `lib` here has no DOM, and an
 *  explicit shape also says what a test double has to provide. */
type OptOutStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * A `beforeSend`: the event untouched, the event without the parameter, or
 * `null` when this browser has opted out.
 *
 * Every failure — no `localStorage` (a sandboxed iframe, blocked site data, a
 * Node test), an unparseable URL — resolves to sending the event as it came.
 * Miscounting the owner once is cheaper than losing a reader's view.
 */
export function optOutBeforeSend<E extends { url: string }>(event: E): E | null {
  try {
    const url = new URL(event.url);
    const flag = url.searchParams.get('va-disable');
    const storage = (globalThis as { localStorage?: OptOutStorage }).localStorage;

    if (!storage) return event;
    if (flag === '0') storage.removeItem('va-disable');
    else if (flag !== null) storage.setItem('va-disable', '1');

    if (storage.getItem('va-disable') !== null) return null;
    if (flag === null) return event;

    url.searchParams.delete('va-disable');

    return { ...event, url: url.toString() };
  } catch {
    return event;
  }
}

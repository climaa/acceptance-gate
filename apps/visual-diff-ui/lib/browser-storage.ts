/**
 * `localStorage`, for the state that lives in one browser and nowhere else.
 *
 * Storage throws rather than returning null in private mode and with site data
 * blocked, and is absent entirely on the server. Both collapse to the caller's
 * fallback: losing browser-only state is a smaller failure than a console that
 * throws.
 *
 * Its own module rather than a private helper of the first file that needed it,
 * because there are now two — the review marks a reader keeps per report, and
 * the run they have put away in the current-job panel.
 */
export function withStorage<T>(fallback: T, operation: (storage: Storage) => T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return operation(localStorage);
  } catch {
    return fallback;
  }
}

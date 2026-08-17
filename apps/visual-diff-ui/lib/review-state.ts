/**
 * Which variants a reader has already looked at, per report.
 *
 * Browser-only state, deliberately: a review mark is one person keeping their
 * place in one report, not a fact about the run. It never reaches the server,
 * so it never has to be reconciled between two reviewers or invalidated by a
 * new capture — and nothing here may be called during a server render.
 *
 * Pinned in this issue rather than in the screen that first draws it, because
 * two later ones read the same key: the report review loop, and the accept gate
 * that refuses to accept baselines nobody has reviewed.
 */

/** `vd-review:<reportId>` → a JSON array of variant keys. */
export const reviewStorageKey = (reportId: string) => `vd-review:${reportId}`;

/**
 * Storage throws rather than returning null in private mode and with site data
 * blocked, and is absent entirely on the server. Both collapse to "no marks":
 * losing a place-keeper is a smaller failure than a console that throws.
 */
function withStorage<T>(fallback: T, operation: (storage: Storage) => T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    return operation(localStorage);
  } catch {
    return fallback;
  }
}

const isVariantKeyList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** The variant keys marked reviewed in `reportId`, in the order they were marked. */
export function readReviewed(reportId: string): string[] {
  return withStorage<string[]>([], (storage) => {
    const raw = storage.getItem(reviewStorageKey(reportId));
    if (raw === null) return [];

    // Anything else under the key was not written by this app — a hand-edited
    // value, or a shape from a future version. Reading it as "nothing reviewed"
    // is recoverable; the next mark rewrites it.
    const parsed: unknown = JSON.parse(raw);
    return isVariantKeyList(parsed) ? parsed : [];
  });
}

/**
 * Marks `variantKey` reviewed (or not) and returns the report's marks after the
 * change — the caller renders from the return value, so a write that storage
 * refused still shows the reader what they just did.
 */
export function setReviewed(
  reportId: string,
  variantKey: string,
  reviewed: boolean,
): string[] {
  const current = readReviewed(reportId).filter((key) => key !== variantKey);
  const next = reviewed ? [...current, variantKey] : current;

  withStorage(undefined, (storage) =>
    storage.setItem(reviewStorageKey(reportId), JSON.stringify(next)),
  );

  return next;
}

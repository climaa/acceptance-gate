// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readReviewed, reviewStorageKey, setReviewed } from '../lib/review-state';

/**
 * Review marks are a reader's own place-keeping, so they live in the browser
 * and never reach the server. That makes every failure mode a storage failure:
 * no storage at all (a server render), storage that throws (private mode), or
 * storage holding something this app did not write.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const VARIANT = 'atoms__desktop__light__atoms-prose--default';
const OTHER_VARIANT = 'templates__mobile__dark__templates-posttemplate--default';

/** The parts of `Storage` this module uses, backed by a plain object. */
function fakeStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    read: (key: string) => entries.get(key) ?? null,
  };
}

const install = (seed?: Record<string, string>) => {
  const storage = fakeStorage(seed);
  vi.stubGlobal('localStorage', storage);
  return storage;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reviewStorageKey', () => {
  // Two later issues read this key — the report review loop and the accept
  // gate. Its shape is the contract between them.
  it('namespaces the marks by report id', () => {
    const key = reviewStorageKey(REPORT);

    expect(key).toBe(`vd-review:${REPORT}`);
  });
});

describe('readReviewed', () => {
  it('reads nothing for a report that has never been reviewed', () => {
    install();

    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([]);
  });

  it('reads the marks back in the order they were made', () => {
    install({ [reviewStorageKey(REPORT)]: JSON.stringify([VARIANT, OTHER_VARIANT]) });

    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([VARIANT, OTHER_VARIANT]);
  });

  it('ignores a stored value this app did not write', () => {
    install({ [reviewStorageKey(REPORT)]: 'not json' });

    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([]);
  });

  it('ignores a stored array holding anything but variant keys', () => {
    install({ [reviewStorageKey(REPORT)]: JSON.stringify([VARIANT, 7]) });

    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([]);
  });

  // Server renders have no storage, and the module is imported by components
  // that render on both sides.
  it('reads nothing when there is no storage at all', () => {
    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([]);
  });

  it('reads nothing when storage refuses to answer', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('The operation is insecure.');
      },
      setItem: () => {},
    });

    const reviewed = readReviewed(REPORT);

    expect(reviewed).toEqual([]);
  });
});

describe('setReviewed', () => {
  it('marks a variant reviewed and persists it under the report key', () => {
    const storage = install();

    const reviewed = setReviewed(REPORT, VARIANT, true);

    expect(reviewed).toEqual([VARIANT]);
    expect(storage.read(reviewStorageKey(REPORT))).toBe(JSON.stringify([VARIANT]));
  });

  it('marks a variant unreviewed again', () => {
    install({ [reviewStorageKey(REPORT)]: JSON.stringify([VARIANT, OTHER_VARIANT]) });

    const reviewed = setReviewed(REPORT, VARIANT, false);

    expect(reviewed).toEqual([OTHER_VARIANT]);
  });

  it('marking a variant twice leaves one mark', () => {
    install({ [reviewStorageKey(REPORT)]: JSON.stringify([VARIANT]) });

    const reviewed = setReviewed(REPORT, VARIANT, true);

    expect(reviewed).toEqual([VARIANT]);
  });

  it('leaves other reports untouched', () => {
    const storage = install({ 'vd-review:other': JSON.stringify([OTHER_VARIANT]) });

    setReviewed(REPORT, VARIANT, true);

    expect(storage.read('vd-review:other')).toBe(JSON.stringify([OTHER_VARIANT]));
  });

  // A reader whose storage is blocked still gets to review — the marks just do
  // not survive the reload, which beats a console that throws on every click.
  it('still answers when storage refuses the write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });

    const reviewed = setReviewed(REPORT, VARIANT, true);

    expect(reviewed).toEqual([VARIANT]);
  });
});

// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { shotSources, shotUrl } from '../lib/shots';
import type { Variant } from '../lib/summary';

/**
 * Which of the three PNGs a run actually wrote, and where they are served from.
 *
 * `summary.json` records no file list, so the viewer has to derive it — and a
 * frame pointed at a shot the run never wrote is a broken image where a
 * reviewer expects evidence. The rules here are the producer's own
 * (`packages/visual-diff/src/compare.mjs`), read back.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';

/** What the producer writes for a row where no pair of shots was compared. */
const NOTHING_COMPARED = {
  overlapDiffPixels: 0,
  marginPixels: 0,
  diffPixels: 0,
  allowedDiffPixels: 0,
} as const;

function variant(overrides: Partial<Variant> & Pick<Variant, 'key' | 'id'>): Variant {
  return {
    tier: 'atoms',
    viewport: 'desktop',
    theme: 'light',
    bucket: 'changed',
    overlapDiffPixels: 4213,
    marginPixels: 0,
    diffPixels: 4213,
    allowedDiffPixels: 292,
    width: 1248,
    height: 469,
    sizeDelta: null,
    violations: [],
    error: null,
    ...overrides,
  };
}

const CHANGED = variant({
  key: 'atoms__desktop__light__atoms-prose--default',
  id: 'atoms-prose--default',
});

describe('a shot URL', () => {
  it('addresses the report route that serves the file', () => {
    const url = shotUrl(REPORT, CHANGED.key, 'diff');

    expect(url).toBe(
      '/api/shots/main-2026-08-17__main-2026-08-13/atoms__desktop__light__atoms-prose--default.diff.png',
    );
  });

  // The route is immutable and same-origin: a data URI would re-send the bytes
  // with every render of the page they are already cached for.
  it('is never a data URI or a foreign host', () => {
    const sources = Object.values(shotSources(REPORT, CHANGED));

    for (const source of sources) {
      expect(source?.startsWith('/api/shots/')).toBe(true);
    }
  });
});

describe('the shots a variant has', () => {
  it('gives a changed variant all three', () => {
    const shots = shotSources(REPORT, CHANGED);

    expect(Object.values(shots).every(Boolean)).toBe(true);
  });

  it('gives an added variant no baseline and no diff', () => {
    const shots = shotSources(
      REPORT,
      variant({
        key: 'atoms__desktop__light__atoms-bucketchip--tones',
        id: 'atoms-bucketchip--tones',
        bucket: 'added',
        ...NOTHING_COMPARED,
      }),
    );

    expect(shots.baseline).toBeUndefined();
    expect(shots.candidate).toBeDefined();
    expect(shots.diff).toBeUndefined();
  });

  it('gives a removed variant no candidate and no diff', () => {
    const shots = shotSources(
      REPORT,
      variant({
        key: 'molecules__desktop__light__molecules-taglist--empty',
        id: 'molecules-taglist--empty',
        tier: 'molecules',
        bucket: 'removed',
        ...NOTHING_COMPARED,
      }),
    );

    expect(shots.baseline).toBeDefined();
    expect(shots.candidate).toBeUndefined();
    expect(shots.diff).toBeUndefined();
  });

  it('gives an errored variant no candidate — the capture produced no PNG', () => {
    const shots = shotSources(
      REPORT,
      variant({
        key: 'atoms__desktop__light__atoms-prose--default',
        id: 'atoms-prose--default',
        bucket: 'errored',
        error: 'Timeout 30000ms exceeded waiting for #storybook-root',
        ...NOTHING_COMPARED,
      }),
    );

    expect(shots.candidate).toBeUndefined();
    expect(shots.diff).toBeUndefined();
  });

  // The differ paints a diff only for a pair that failed its allowance — an
  // a11y variant whose pixels matched has two shots and nothing between them.
  it('gives a variant within its allowance no diff', () => {
    const shots = shotSources(
      REPORT,
      variant({
        key: 'atoms__desktop__light__atoms-badge--tones',
        id: 'atoms-badge--tones',
        bucket: 'a11y',
        overlapDiffPixels: 0,
        diffPixels: 0,
        violations: [{ id: 'color-contrast', nodes: 2 }],
      }),
    );

    expect(shots.baseline).toBeDefined();
    expect(shots.candidate).toBeDefined();
    expect(shots.diff).toBeUndefined();
  });
});

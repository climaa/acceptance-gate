// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VariantRow } from '../components/VariantRow';
import { BUCKETS, type Bucket, type Variant } from '../lib/summary';

/**
 * One variant row: the word it puts on its verdict, and the numbers it declines
 * to put on one it never measured.
 *
 * This file exists because of what shipped without it. The badge used to read
 * `pass`/`fail`, derived from `bucket === 'unchanged'` — and `artifacts.mjs`
 * drops every `unchanged` row before writing `summary.json`, keeping only its
 * count. The `pass` branch could not render, so the badge was the constant
 * `fail` on every row of every report, including a story that was merely added
 * and had no baseline to have failed against. A constant is exactly the bug a
 * screenshot does not reveal and a test does, so the first case below walks
 * every bucket rather than sampling one.
 */

const REPORT_ID = 'main-2026-08-17__main-2026-08-13';

const SIDES = { a: 'main-2026-08-17', b: 'main-2026-08-13' };

/** The metric that may only appear where two shots were compared. */
const SHARED_AREA = /differ in the shared area/;

function variant(overrides: Partial<Variant> = {}): Variant {
  return {
    key: 'atoms__desktop__light__atoms-badge--tones',
    id: 'atoms-badge--tones',
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

/** The zeros `compare.mjs` spreads over a row where nothing was measured. A
 *  missing count and a count of zero are the same JSON, which is the whole
 *  reason these rows must not quote one. */
const nothingCompared = {
  overlapDiffPixels: 0,
  marginPixels: 0,
  diffPixels: 0,
  allowedDiffPixels: 0,
} satisfies Partial<Variant>;

function renderRow(overrides: Partial<Variant> = {}) {
  return render(
    <VariantRow
      reportId={REPORT_ID}
      variant={variant(overrides)}
      sides={SIDES}
      onCompare={vi.fn()}
    />,
  );
}

/** The verdict badge, found the way the atom is asserted elsewhere: by the word
 *  a reviewer reads, then by the tone class the atom put on it. */
const badge = (word: string) => screen.getByText(word);

afterEach(cleanup);

describe('the verdict badge', () => {
  /** Every bucket, and the tone it earns. `a11y` diverges from `BUCKET_TONES`
   *  only because `BadgeTone` has no `a11y` member — see `VariantRow`. */
  const TONES: Record<Bucket, string> = {
    changed: 'accent',
    added: 'accent',
    removed: 'danger',
    errored: 'danger',
    a11y: 'danger',
    unchanged: 'neutral',
  };

  // Walked rather than sampled: the bug this replaces was a badge that said the
  // same thing for all six, which any single-bucket case would have passed.
  for (const bucket of BUCKETS) {
    it(`says "${bucket}" on a ${bucket} variant`, () => {
      renderRow({ bucket, ...(bucket === 'changed' ? {} : nothingCompared) });

      expect(badge(bucket).className).toBe(`ds-badge ds-badge--${TONES[bucket]}`);
    });
  }

  // The regression, stated as itself: the word the row must never invent for a
  // corpus that moved. `compare.mjs` is explicit that `added` and `removed` are
  // an accept decision, not a defect.
  it('never calls an added story a failure', () => {
    renderRow({ bucket: 'added', ...nothingCompared });

    expect(screen.queryByText('fail')).toBeNull();
    expect(screen.queryByText('pass')).toBeNull();
  });
});

describe('the pixel metric', () => {
  it('reports the shared area for a pair that was compared', () => {
    renderRow();

    expect(screen.getByText(SHARED_AREA)).toBeTruthy();
    expect(screen.getByText('4,213 px')).toBeTruthy();
  });

  // The second half of the same defect as the badge. An `added` story has no
  // baseline, so there is no shared area — and `0 px differ in the shared area`
  // reads as "measured, and clean" when nothing was measured at all.
  it.each([
    ['added', 'has no baseline behind it'],
    ['removed', 'has no candidate left'],
    ['errored', 'produced no PNG'],
  ] as const)('stays silent about pixels for a %s variant, which %s', (bucket, _why) => {
    renderRow({ bucket, ...nothingCompared });

    expect(screen.queryByText(SHARED_AREA)).toBeNull();
  });
});

describe('an a11y variant', () => {
  const VIOLATIONS = [{ id: 'color-contrast', nodes: 3 }];

  it('lists the violations instead of shots', () => {
    renderRow({ bucket: 'a11y', violations: VIOLATIONS });

    const list = screen.getByRole('list', { name: 'violations' });
    expect(within(list).getByText('color-contrast')).toBeTruthy();
    expect(within(list).getByText('3 node(s)')).toBeTruthy();

    // The pixels can be identical and the finding still total, so the viewer is
    // replaced outright rather than sitting empty beside the list.
    expect(screen.queryByRole('figure')).toBeNull();
  });

  // An `a11y` row was compared like any other — `bucketOf` lets the violation
  // outrank the pixel verdict, it does not discard the measurement.
  it('still reports the pixels it measured', () => {
    renderRow({ bucket: 'a11y', violations: VIOLATIONS });

    expect(screen.getByText(SHARED_AREA)).toBeTruthy();
  });
});

describe('a capture that errored', () => {
  it("carries the browser's own message", () => {
    const error = 'Timeout 30000ms exceeded waiting for #storybook-root';
    renderRow({ bucket: 'errored', error, ...nothingCompared });

    expect(screen.getByText(error)).toBeTruthy();
  });
});

// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { buildSections, showsDevStorybook, viewportGaps } from '../lib/report-view';
import type { Variant } from '../lib/summary';

/**
 * The two things the report derives rather than reads.
 *
 * A card showing only `desktop/*` is two entirely different reports depending
 * on its tier — `TIER_VIEWPORTS` shoots atoms and molecules at desktop only, so
 * an atoms card never had a mobile shot, while a templates card with the same
 * rows was shot at mobile and matched its baseline. Both absences look
 * identical on screen, and saying either sentence for the other case would be a
 * false statement about the run.
 */

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

/** The card the report would build from these variants — the same grouping the
 *  page uses, rather than a hand-assembled shape that could drift from it. */
function cardOf(...variants: Variant[]) {
  const [section] = buildSections(variants);
  const card = section?.cards[0];
  if (!card) throw new Error('the fixture built no card');

  return card;
}

/** One story's cell in the capture matrix, keyed the way the producer keys it. */
function cell(tier: Variant['tier'], id: string, overrides: Partial<Variant> = {}) {
  const viewport = overrides.viewport ?? 'desktop';
  const theme = overrides.theme ?? 'light';

  return variant({
    key: `${tier}__${viewport}__${theme}__${id}`,
    id,
    tier,
    ...overrides,
  });
}

const PROSE = 'atoms-prose--default';
const POST = 'templates-posttemplate--default';

describe('the viewports a card has no rows for', () => {
  it('says an atoms card was never shot at mobile', () => {
    const card = cardOf(cell('atoms', PROSE), cell('atoms', PROSE, { theme: 'dark' }));

    const gaps = viewportGaps(card);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('no mobile shot');
    expect(gaps[0]).toContain('atoms are captured at desktop only');
  });

  it('says a templates card matched, because that tier is shot at mobile', () => {
    const card = cardOf(
      cell('templates', POST),
      cell('templates', POST, { theme: 'dark' }),
    );

    const gaps = viewportGaps(card);

    // The same missing rows as the atoms card above, and the opposite reason:
    // the shot exists, it simply did not differ.
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('matched its baseline');
    expect(gaps[0]).not.toContain('captured at');
  });

  it('says nothing when every cell of the matrix is on screen', () => {
    const card = cardOf(
      cell('templates', POST),
      cell('templates', POST, { theme: 'dark' }),
      cell('templates', POST, { viewport: 'mobile' }),
      cell('templates', POST, { viewport: 'mobile', theme: 'dark' }),
    );

    const gaps = viewportGaps(card);

    expect(gaps).toEqual([]);
  });

  it('says nothing about a viewport that has one row and not the other', () => {
    const card = cardOf(
      cell('templates', POST),
      cell('templates', POST, { theme: 'dark' }),
      cell('templates', POST, { viewport: 'mobile' }),
    );

    const gaps = viewportGaps(card);

    // `mobile/dark` matched, but mobile is on screen — a viewport a reviewer can
    // see is not a viewport they are missing.
    expect(gaps).toEqual([]);
  });

  it('says nothing about an atoms story captured beyond its tier anyway', () => {
    // `visual-diff:all-viewports` promotes one story past TIER_VIEWPORTS. The
    // summary records no tags, so the rows themselves are the evidence.
    const card = cardOf(
      cell('atoms', PROSE),
      cell('atoms', PROSE, { viewport: 'mobile' }),
    );

    const gaps = viewportGaps(card);

    expect(gaps).toEqual([]);
  });

  it('says nothing on an accessibility card, which renders no shots at all', () => {
    const card = cardOf(
      cell('atoms', PROSE, {
        bucket: 'a11y',
        overlapDiffPixels: 0,
        violations: [{ id: 'color-contrast', nodes: 2 }],
      }),
    );

    const gaps = viewportGaps(card);

    expect(gaps).toEqual([]);
  });
});

describe('the dev Storybook link', () => {
  it('is offered while someone is running the design system beside the console', () => {
    expect(showsDevStorybook('development')).toBe(true);
  });

  it('is withheld from a deployed console, where localhost:6006 is nothing', () => {
    expect(showsDevStorybook('production')).toBe(false);
  });
});

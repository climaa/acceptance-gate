// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildSections,
  filterByBucket,
  sectionViewportNote,
  showsDevStorybook,
  storybookLink,
  viewportGaps,
} from '../lib/report-view';
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
  // The tier-scoped half now belongs to the section, so the card says nothing:
  // "atoms are captured at desktop only" is identically true of every card in
  // the tier, and twenty cards repeating it is twenty times a reader hears it.
  it('leaves a never-captured viewport to the section rather than the card', () => {
    const card = cardOf(cell('atoms', PROSE), cell('atoms', PROSE, { theme: 'dark' }));

    const gaps = viewportGaps(card);

    expect(gaps).toEqual([]);
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

  // The regression: a story is a card per bucket, so one that changed at desktop
  // and errored at mobile is two cards in the same tier. Reading only its own
  // variants, each card announced the other's viewport as matched — while the
  // row for it was on screen, a few hundred pixels away, under the other bucket.
  it('says nothing about a viewport whose row is on the page under another bucket', () => {
    const sections = buildSections([
      cell('templates', POST),
      cell('templates', POST, {
        viewport: 'mobile',
        bucket: 'errored',
        error: 'capture timed out',
      }),
    ]);
    const cards = sections.flatMap((section) => section.cards);

    const gaps = cards.map((card) => viewportGaps(card));

    expect(cards).toHaveLength(2);
    expect(gaps).toEqual([[], []]);
  });

  // Same story, but the other row is in the Accessibility section rather than
  // another bucket of the same tier — the split this one has to see across.
  it('says nothing about a viewport whose row is in the accessibility section', () => {
    const sections = buildSections([
      cell('templates', POST),
      cell('templates', POST, {
        viewport: 'mobile',
        bucket: 'a11y',
        violations: [{ id: 'color-contrast', nodes: 2 }],
      }),
    ]);
    const pixelCard = sections
      .flatMap((section) => section.cards)
      .find((c) => c.bucket === 'changed');

    const gaps = viewportGaps(pixelCard!);

    expect(gaps).toEqual([]);
  });

  // The bucket chip filters before the sections are built, so a filtered view
  // hands `buildSections` a corpus with rows missing that are still part of the
  // run. Reading the denominator off that would let a chip a reviewer pressed
  // turn "you hid this row" into "this shot was never taken".
  it('says nothing about a viewport whose row the bucket filter is hiding', () => {
    const corpus = [
      cell('templates', POST),
      cell('templates', POST, {
        viewport: 'mobile',
        bucket: 'errored',
        error: 'timeout',
      }),
    ];

    const gaps = buildSections(filterByBucket(corpus, 'changed'), corpus)
      .flatMap((section) => section.cards)
      .flatMap((card) => viewportGaps(card));

    expect(gaps).toEqual([]);
  });

  it('names the desktop gap on a story that only has mobile rows', () => {
    const card = cardOf(cell('templates', POST, { viewport: 'mobile' }));

    const gaps = viewportGaps(card);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('no desktop rows');
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

describe('the viewport note a tier carries', () => {
  it('says once that atoms are never shot at mobile', () => {
    const [section] = buildSections([
      cell('atoms', PROSE),
      cell('atoms', PROSE, { theme: 'dark' }),
    ]);

    const note = sectionViewportNote(section!);

    expect(note).toContain('no mobile shot');
    expect(note).toContain('atoms are captured at desktop only');
  });

  it('says nothing for a tier that is shot at every viewport', () => {
    const [section] = buildSections([
      cell('templates', POST),
      cell('templates', POST, { theme: 'dark' }),
    ]);

    const note = sectionViewportNote(section!);

    // Mobile is missing from this section, but templates *are* shot at mobile —
    // that is the card's "matched its baseline", not a fact about the tier.
    expect(note).toBeUndefined();
  });

  it('says nothing when the tier only holds a story captured beyond it', () => {
    // `visual-diff:all-viewports` gives one atoms story mobile rows. The tier
    // note is derived from the cards, so a section with nothing missing is quiet.
    const [section] = buildSections([
      cell('atoms', PROSE),
      cell('atoms', PROSE, { viewport: 'mobile' }),
    ]);

    const note = sectionViewportNote(section!);

    expect(note).toBeUndefined();
  });
});

describe('the dev Storybook link', () => {
  it('is offered while someone is running the design system beside the console', () => {
    const offered = showsDevStorybook('development');

    expect(offered).toBe(true);
  });

  it('is withheld from a deployed console, where localhost:6006 is nothing', () => {
    const offered = showsDevStorybook('production');

    expect(offered).toBe(false);
  });
});

describe('a Storybook deep link', () => {
  const BASE = 'https://acceptance-gate-storybook.vercel.app';

  // Asserted here rather than only through a rendered `href`, which is three
  // layers above the string being built.
  it('opens the manager on the story, in the theme, with the colon literal', () => {
    const href = storybookLink(BASE, 'atoms-prose--default', 'dark');

    expect(href).toBe(
      `${BASE}/index.html?path=/story/atoms-prose--default&globals=colorScheme:dark`,
    );
  });

  // The colon is what selects the global. Percent-encoded, Storybook accepts the
  // URL and silently ignores it, so every dark link opens a light story.
  it('leaves the globals colon unencoded', () => {
    const href = storybookLink(BASE, 'atoms-prose--default', 'dark');

    expect(href).toContain('globals=colorScheme:dark');
    expect(href).not.toContain('%3A');
  });

  it('encodes a story id that carries a character a query would eat', () => {
    const href = storybookLink(BASE, 'atoms-prose--a&b', 'light');

    expect(href).toContain('path=/story/atoms-prose--a%26b');
  });

  /**
   * The bug this guards: `apps/storybook/vercel.json` redirects `/` to the
   * Welcome page, and Vercel resolves a redirect by keeping the destination's
   * query and appending the request's — so a link built on the bare origin
   * arrived with its story replaced and its colon percent-encoded. A string
   * assertion cannot see a redirect, but the redirect is committed in this repo,
   * so the collision can be checked statically. `apps/storybook`'s own
   * `docs-links.test.ts` reads the same file for the same kind of reason.
   */
  it('targets a path the published Storybook does not redirect', () => {
    const config = JSON.parse(
      fs.readFileSync(
        path.join(import.meta.dirname, '..', '..', 'storybook', 'vercel.json'),
        'utf8',
      ),
    ) as { redirects?: readonly { source: string }[] };
    const sources = (config.redirects ?? []).map((redirect) => redirect.source);

    const { pathname } = new URL(storybookLink(BASE, 'atoms-prose--default', 'dark'));

    expect(sources).not.toContain(pathname);
  });
});

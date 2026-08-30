import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INTROS } from '@/content/intros';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';
import { FEATURE_SOURCES } from '@/lib/sources';

/**
 * What this guards, and what it deliberately does not.
 *
 * It does not compare rendered pages against their `.feature` sources. It could
 * not: the pages are parsed from those same sources during `next build`, so a
 * changed step changes the page in the same commit and a comparison would be a
 * value against itself. Content drift is structurally impossible here, which is
 * a stronger property than any check.
 *
 * What is possible is the inventory moving without anyone noticing — a scenario
 * added or deleted, a feature renamed out from under the allowlist, a page left
 * with no prose around content that changed. That is what the pins below are
 * for, and it is the same job `apps/e2e/scripts/suite-integrity.mjs` does for
 * the suite as a whole.
 *
 * Sharpen the point when this fails: the fix is not to update the number. It is
 * to read the page the change lands on and decide whether the prose around it
 * still tells the truth — then update the number.
 */
describe('the allowlist matches the published features', () => {
  it.each(MANUAL_PAGES)('$slug parses from $featurePath', (page) => {
    const feature = parseManualPage(page);

    expect(feature.name).not.toBe('');
    expect(feature.scenarios.length).toBeGreaterThan(0);
  });

  it.each(MANUAL_PAGES)(
    '$slug still has exactly $expectedScenarios scenarios',
    (page) => {
      const feature = parseManualPage(page);

      expect(feature.scenarios).toHaveLength(page.expectedScenarios);
    },
  );

  it('gives every page a distinct slug', () => {
    const slugs = MANUAL_PAGES.map((page) => page.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('opens a source for every allowlisted page, and no other', () => {
    const slugs: string[] = MANUAL_PAGES.map((page) => page.slug);

    expect(Object.keys(FEATURE_SOURCES).sort()).toEqual([...slugs].sort());
  });

  // The seam between the two encodings of the same three paths. `lib/sources.ts`
  // holds the literals that are actually opened — they have to be literals or
  // Turbopack traces the whole repository — and `featurePath` here is the label
  // printed when parsing fails. Nothing but this makes them agree, and a
  // `featurePath` that drifted would send a reader to the wrong file with no
  // test going red.
  it.each(MANUAL_PAGES)('$slug reads the file $featurePath names', (page) => {
    const named = readFileSync(join('..', '..', page.featurePath), 'utf8');

    expect(FEATURE_SOURCES[page.slug]).toBe(named);
  });
});

describe('the authored lane covers the routing', () => {
  it.each(MANUAL_PAGES)('$slug has intro prose', (page) => {
    const paragraphs = INTROS[page.slug];

    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.every((paragraph) => paragraph.trim() !== '')).toBe(true);
  });

  it('writes prose for no page that does not exist', () => {
    const slugs: string[] = MANUAL_PAGES.map((page) => page.slug);

    expect(Object.keys(INTROS).sort()).toEqual(slugs.sort());
  });
});

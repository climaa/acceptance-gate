// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { APPS, parseVariantKey, type App } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';
import { jumpMarkCss } from '../components/SetFilterBar';
import { buildSections } from '../lib/report-view';
import { SECTIONS, sectionOf } from '../lib/sections';
import { groupShots, parseShotName, type SetShot } from '../lib/set-view';
import type { Variant } from '../lib/summary';

/**
 * The console's sections: the design system's tiers, then one per app's screens,
 * then `other`. The set page and the report both group by them, so what this
 * file pins is one answer to "which section is this shot in" — for both.
 */

describe('SECTIONS', () => {
  // The tab reads like Storybook's sidebar: `Screens/Visual-diff-ui/…` there,
  // `Screens / Visual-diff-ui` here.
  it("labels an app's section as Storybook titles its screens", () => {
    const section = SECTIONS.find((entry) => entry.key === 'screens-visual-diff-ui');

    expect(section?.label).toBe('Screens / Visual-diff-ui');
  });

  it("walks the tiers, then the policy's apps, then other", () => {
    const labels = SECTIONS.map((section) => section.label);

    expect(labels).toEqual([
      'atoms',
      'molecules',
      'organisms',
      'templates',
      ...APPS.map((app) => `Screens / ${app.charAt(0).toUpperCase()}${app.slice(1)}`),
      'Screens / Other',
    ]);
  });

  it('gives every section an anchor of its own', () => {
    const anchors = new Set(SECTIONS.map((section) => section.anchor));

    expect(anchors.size).toBe(SECTIONS.length);
  });
});

/**
 * `App` is transcribed by hand in types/visual-diff/policy.d.ts; `APPS` is the
 * real module's, read off `APP_ROOTS`. Each half catches one direction of drift:
 * tsc fails this object if the union gains or loses a name, and the assertion
 * fails if the policy does.
 */
const DECLARED_APPS: Record<App, true> = { 'visual-diff-ui': true };

describe('the declared App type', () => {
  it('names exactly the apps the policy has', () => {
    const declared = Object.keys(DECLARED_APPS);

    expect([...APPS].sort()).toEqual(declared.sort());
  });
});

describe('sectionOf', () => {
  it.each(APPS)("places a %s screen in that app's section", (app) => {
    const section = sectionOf('screens', `screens-${app}-reader-somescreen--default`);

    expect(section.key).toBe(`screens-${app}`);
  });

  it('places a design-system story in its tier', () => {
    const section = sectionOf('organisms', 'organisms-table--default');

    expect(section.key).toBe('organisms');
  });

  it('places a screen of an app the policy does not name in other', () => {
    const section = sectionOf('screens', 'screens-garden-reader-plantscreen--default');

    expect(section.key).toBe('screens-other');
  });
});

/** The keys one capture of every kind of section would write. */
const KEYS = [
  'screens__desktop__light__screens-garden-reader-plantscreen--default',
  'screens__desktop__light__screens-visual-diff-ui-report--changed',
  'organisms__mobile__dark__organisms-table--default',
  'screens__desktop__light__screens-visual-diff-ui-dashboard--sample',
  'atoms__desktop__light__atoms-badge--accent',
  'templates__mobile__dark__templates-posttemplate--default',
];

const shotOf = (key: string): SetShot => {
  const cell = parseShotName(`${key}.png`);
  if (!cell) throw new Error(`not a variant key: ${key}`);

  return { ...cell, bytes: 10, width: 1248, height: 25 };
};

const variantOf = (key: string): Variant => {
  const cell = parseVariantKey(key);
  if (!cell) throw new Error(`not a variant key: ${key}`);

  return {
    key,
    id: cell.id,
    tier: cell.tier,
    viewport: cell.viewport,
    theme: cell.theme,
    bucket: 'changed',
    overlapDiffPixels: 1,
    marginPixels: 0,
    diffPixels: 1,
    allowedDiffPixels: 0,
    width: 1248,
    height: 25,
    sizeDelta: null,
    violations: [],
    error: null,
  };
};

describe('the set page and the report', () => {
  it('draw the same sections, in the same order, for the same shots', () => {
    const set = groupShots(KEYS.map(shotOf)).map(({ section }) => section.label);
    const report = buildSections(KEYS.map(variantOf)).map((section) => section.name);

    expect(report).toEqual(set);
  });
});

describe('jumpMarkCss', () => {
  // Written by hand in set.css, these were one rule per tier and none for any
  // app, so a jump to a screens section lit nothing.
  it('marks the jump link of every section the set holds', () => {
    const sections = groupShots(KEYS.map(shotOf));

    const css = jumpMarkCss(sections);

    for (const { section } of sections) {
      expect(css).toContain(
        `.vd-set-view:has(#${section.anchor}:target) .vd-set__jump[href='#${section.anchor}']`,
      );
    }
  });

  it('writes no rule for a set with no sections', () => {
    const css = jumpMarkCss([]);

    expect(css).toBe('');
  });
});

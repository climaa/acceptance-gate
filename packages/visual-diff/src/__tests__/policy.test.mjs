import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import {
  ALL_VIEWPORTS_TAG,
  BASELINE_BUDGET_BYTES,
  BASELINE_PNG_BUDGET_BYTES,
  COLOR_SCHEME_GLOBAL,
  DETERMINISM,
  EXIT,
  FULLPAGE_TAG,
  HOST,
  MODES,
  PATHS,
  SKIP_TAG,
  THEMES,
  TIERS,
  VIEWPORTS,
  parseVariantKey,
  tierOf,
  variantKey,
} from '../policy.mjs';

const STORY_ID = 'atoms-button--primary';

const viewportsFor = (tier) =>
  new Set(MODES.filter((mode) => mode.tier === tier).map((mode) => mode.viewport));

const themesFor = (tier, viewport) =>
  MODES.filter((mode) => mode.tier === tier && mode.viewport === viewport).map(
    (mode) => mode.theme,
  );

describe('TIERS', () => {
  it('lists the four atomic-design tiers, innermost first', () => {
    expect(TIERS).toEqual(['atoms', 'molecules', 'organisms', 'templates']);
  });
});

describe('MODES', () => {
  it('has 12 entries: atoms 1x2, molecules 1x2, organisms 2x2, templates 2x2', () => {
    expect(MODES).toHaveLength(12);
  });

  it('uses only viewports that exist in VIEWPORTS', () => {
    const knownViewports = Object.keys(VIEWPORTS);

    for (const mode of MODES) {
      expect(knownViewports).toContain(mode.viewport);
    }
  });

  it('captures atoms and molecules only at desktop', () => {
    for (const tier of ['atoms', 'molecules']) {
      expect(viewportsFor(tier)).toEqual(new Set(['desktop']));
    }
  });

  it('captures organisms and templates at both desktop and mobile', () => {
    for (const tier of ['organisms', 'templates']) {
      expect(viewportsFor(tier)).toEqual(new Set(['desktop', 'mobile']));
    }
  });

  it('captures every tier/viewport cell in each theme exactly once', () => {
    for (const mode of MODES) {
      expect(themesFor(mode.tier, mode.viewport)).toEqual(THEMES);
    }
  });

  it('uses only tiers that exist in TIERS', () => {
    for (const mode of MODES) {
      expect(TIERS).toContain(mode.tier);
    }
  });

  it('gives no two modes the same variant key', () => {
    const keys = MODES.map((mode) => variantKey({ ...mode, id: STORY_ID }));

    expect(new Set(keys).size).toBe(MODES.length);
  });
});

describe('tierOf', () => {
  it('derives the tier from a story path in each tier folder', () => {
    const paths = TIERS.map(
      (tier) => `packages/ui/src/${tier}/Widget/Widget.stories.tsx`,
    );

    const tiers = paths.map((path) => tierOf(path));

    expect(tiers).toEqual(TIERS);
  });

  it("resolves an importPath relative to Storybook's config dir", () => {
    const path = '../../packages/ui/src/molecules/PostCard/PostCard.stories.tsx';

    const tier = tierOf(path);

    expect(tier).toBe('molecules');
  });

  it('returns null for a file that sits in no tier folder', () => {
    const tiers = ['src/index.ts', 'packages/ui/src/index.ts'].map((path) =>
      tierOf(path),
    );

    expect(tiers).toEqual([null, null]);
  });

  it('returns null for a tier-named folder outside packages/ui', () => {
    const path = 'apps/blog/src/atoms/Widget/Widget.stories.tsx';

    const tier = tierOf(path);

    expect(tier).toBeNull();
  });
});

describe('variantKey / parseVariantKey', () => {
  it('round-trips every cell of the capture matrix', () => {
    const variants = MODES.map((mode) => ({ ...mode, id: STORY_ID }));

    const roundTripped = variants.map((variant) => parseVariantKey(variantKey(variant)));

    expect(roundTripped).toEqual(variants);
  });

  it('round-trips a story id carrying the component/story separator', () => {
    const variant = {
      tier: 'templates',
      viewport: 'mobile',
      theme: 'dark',
      id: 'templates-post-template--with-long-title',
    };

    const roundTripped = parseVariantKey(variantKey(variant));

    expect(roundTripped).toEqual(variant);
  });

  it('returns null for a key with no story id', () => {
    const parsed = parseVariantKey('atoms__desktop__light');

    expect(parsed).toBeNull();
  });

  it('returns null for a key naming a value outside the matrix', () => {
    const parsed = parseVariantKey(`atoms__desktop__sepia__${STORY_ID}`);

    expect(parsed).toBeNull();
  });
});

describe('COLOR_SCHEME_GLOBAL', () => {
  it('is a non-empty string — the one name the toolbar and the capture URL share', () => {
    expect(typeof COLOR_SCHEME_GLOBAL).toBe('string');
    expect(COLOR_SCHEME_GLOBAL.length).toBeGreaterThan(0);
  });
});

describe('story tags', () => {
  it('namespaces three distinct opt-ins', () => {
    const tags = [SKIP_TAG, FULLPAGE_TAG, ALL_VIEWPORTS_TAG];

    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) {
      expect(tag.startsWith('visual-diff:')).toBe(true);
    }
  });
});

describe('HOST', () => {
  // Not a config echo: the image tag and the library version are two files apart, and
  // a container whose bundled browsers are not the ones `apps/e2e` installs renders
  // differently. That divergence lands as a whole-matrix diff with no UI change behind
  // it, so the pin is asserted against its source rather than restated here.
  it('names the container tag for the exact @playwright/test pin apps/e2e carries', () => {
    const e2ePackage = JSON.parse(
      readFileSync(new URL('../../../../apps/e2e/package.json', import.meta.url), 'utf8'),
    );

    const pinned = e2ePackage.devDependencies['@playwright/test'];

    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(HOST.image).toBe(`mcr.microsoft.com/playwright:v${pinned}-noble`);
  });

  it('compares the fields BASELINE_ENV.json records, minus the browser build', () => {
    // `chromium` is recorded for a human reading the file but never compared: it is a
    // property of the pinned image, and `check` runs its host guard before a browser
    // exists to ask for a version.
    expect(HOST.comparedKeys).toEqual(['platform', 'arch', 'image', 'playwright']);
  });
});

describe('DETERMINISM', () => {
  it('gives the stable-shot wait a range to back off across', () => {
    const { min, max } = DETERMINISM.stableShotIntervalMs;

    expect(min).toBeLessThan(max);
  });
});

describe('EXIT', () => {
  // The three-code contract is the thesis: a reader of a red job learns from the number
  // alone whether the UI changed or the gate did. A fourth code is a distinction the
  // workflow then has to branch on, so the count is asserted, not only the values.
  it('is three codes — clean, a human must look, the gate is broken', () => {
    expect(EXIT).toEqual({ ok: 0, diff: 1, broken: 2 });
  });

  it('gives every outcome its own code', () => {
    const codes = Object.values(EXIT);

    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('PATHS', () => {
  it('keeps every path repo-root-relative, so the CLI can be run from anywhere', () => {
    const paths = Object.values(PATHS);

    expect(paths.every((entry) => !entry.startsWith('/') && !entry.startsWith('.'))).toBe(
      true,
    );
  });

  it('puts BASELINE_ENV.json inside the baseline directory it describes', () => {
    expect(PATHS.baselineEnv.startsWith(`${PATHS.baselines}/`)).toBe(true);
  });

  it('writes every per-run artifact under the artifacts directory', () => {
    const perRun = [PATHS.diffs, PATHS.summaryJson, PATHS.summaryMd, PATHS.reportHtml];

    expect(perRun.every((entry) => entry.startsWith(`${PATHS.artifacts}/`))).toBe(true);
  });
});

describe('baseline budgets', () => {
  it('caps one PNG well below the budget for the whole committed set', () => {
    expect(BASELINE_PNG_BUDGET_BYTES).toBeLessThan(BASELINE_BUDGET_BYTES);
  });
});

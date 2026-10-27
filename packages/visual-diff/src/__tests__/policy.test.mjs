import { readFileSync, readdirSync } from 'node:fs';

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
  LEDGER,
  LOCALES,
  LOCALES_TAG,
  LOCALE_GLOBAL,
  MODES,
  PATHS,
  SKIP_TAG,
  THEMES,
  TIERS,
  UI_TIERS,
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
  it('lists the four atomic-design tiers, innermost first, then screens', () => {
    expect(TIERS).toEqual(['atoms', 'molecules', 'organisms', 'templates', 'screens']);
  });

  it('keeps screens out of the tiers that are packages/ui folders', () => {
    expect(UI_TIERS).toEqual(['atoms', 'molecules', 'organisms', 'templates']);
  });
});

describe('MODES', () => {
  it('has 16 entries: atoms 1x2, molecules 1x2, organisms, templates and screens 2x2', () => {
    expect(MODES).toHaveLength(16);
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
    const paths = UI_TIERS.map(
      (tier) => `packages/ui/src/${tier}/Widget/Widget.stories.tsx`,
    );

    const tiers = paths.map((path) => tierOf(path));

    expect(tiers).toEqual(UI_TIERS);
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

  it("places a story under the console's app directory in screens", () => {
    const paths = [
      'apps/visual-diff-ui/app/DashboardScreen.stories.tsx',
      '../visual-diff-ui/app/DashboardScreen.stories.tsx',
    ];

    const tiers = paths.map((path) => tierOf(path));

    expect(tiers).toEqual(['screens', 'screens']);
  });

  it("returns null for another app's app directory", () => {
    const path = '../blog/app/Page.stories.tsx';

    const tier = tierOf(path);

    expect(tier).toBeNull();
  });

  it('never reads a packages/ui folder named screens as a tier', () => {
    const path = 'packages/ui/src/screens/Widget/Widget.stories.tsx';

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

  it('writes a variant with no locale as tier, viewport, theme and id, as before the axis', () => {
    const variant = { tier: 'atoms', viewport: 'desktop', theme: 'dark', id: STORY_ID };

    const key = variantKey(variant);

    expect(key).toBe(`atoms__desktop__dark__${STORY_ID}`);
  });

  it("puts a listed story's locale between the theme and the story id", () => {
    const variant = {
      tier: 'organisms',
      viewport: 'mobile',
      theme: 'light',
      locale: LOCALES[0],
      id: STORY_ID,
    };

    const key = variantKey(variant);

    expect(key).toBe(`organisms__mobile__light__${LOCALES[0]}__${STORY_ID}`);
  });

  it('round-trips a variant in every locale', () => {
    const variants = LOCALES.map((locale) => ({
      tier: 'templates',
      viewport: 'desktop',
      theme: 'dark',
      locale,
      id: 'templates-post-template--with-long-title',
    }));

    const roundTripped = variants.map((variant) => parseVariantKey(variantKey(variant)));

    expect(roundTripped).toEqual(variants);
  });

  it('returns null for a key naming a locale outside LOCALES', () => {
    const parsed = parseVariantKey(`atoms__desktop__light__xx__${STORY_ID}`);

    expect(parsed).toBeNull();
  });

  it('reads every committed baseline back as a variant with no locale', () => {
    const keys = readdirSync(new URL('../../__baselines__/', import.meta.url))
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.slice(0, -'.png'.length));

    const parsed = keys.map(parseVariantKey);

    expect(keys.length).toBeGreaterThan(0);
    expect(parsed.every((variant) => variant !== null && !('locale' in variant))).toBe(
      true,
    );
  });
});

describe('LOCALES', () => {
  it('lists at least the locale Storybook renders when no locale is set', () => {
    expect(LOCALES.length).toBeGreaterThan(0);
    expect(new Set(LOCALES).size).toBe(LOCALES.length);
  });

  it('holds only lowercase language subtags, so a key still splits on its separator', () => {
    expect(LOCALES.every((locale) => /^[a-z]{2,3}$/.test(locale))).toBe(true);
  });
});

describe('LOCALE_GLOBAL', () => {
  it('is its own global, never the theme one', () => {
    expect(LOCALE_GLOBAL.length).toBeGreaterThan(0);
    expect(LOCALE_GLOBAL).not.toBe(COLOR_SCHEME_GLOBAL);
  });
});

describe('COLOR_SCHEME_GLOBAL', () => {
  it('is a non-empty string — the one name the toolbar and the capture URL share', () => {
    expect(typeof COLOR_SCHEME_GLOBAL).toBe('string');
    expect(COLOR_SCHEME_GLOBAL.length).toBeGreaterThan(0);
  });
});

describe('story tags', () => {
  it('namespaces four distinct opt-ins', () => {
    const tags = [SKIP_TAG, FULLPAGE_TAG, ALL_VIEWPORTS_TAG, LOCALES_TAG];

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
    const perRun = [PATHS.diffs, PATHS.summaryJson, PATHS.summaryMd];

    expect(perRun.every((entry) => entry.startsWith(`${PATHS.artifacts}/`))).toBe(true);
  });
});

describe('baseline budgets', () => {
  it('caps one PNG well below the budget for the whole committed set', () => {
    expect(BASELINE_PNG_BUDGET_BYTES).toBeLessThan(BASELINE_BUDGET_BYTES);
  });
});

describe('LEDGER.exempt', () => {
  /** Every stylesheet packages/ui ships, as text. Read rather than resolved through a
   *  dependency because this package has none on @gate/ui; the `@gate/visual-diff#test`
   *  override in turbo.json names these files so a warm cache cannot hide a rename. */
  const UI_SRC = new URL('../../../ui/src/', import.meta.url);
  const UI_CSS = readdirSync(UI_SRC, { recursive: true })
    .filter((file) => String(file).endsWith('.css'))
    .map((file) => readFileSync(new URL(String(file), UI_SRC), 'utf8'))
    .join('\n');

  /** The declarations of the rule an anchor's class opens with, or null if no
   *  stylesheet starts a rule with it. */
  const ruleOf = (anchor) =>
    UI_CSS.match(new RegExp(`(?:^|\\n)\\.${anchor}\\s*\\{([^}]*)\\}`))?.[1] ?? null;

  it.each(LEDGER.exempt.map((entry) => [entry.anchor, entry]))(
    'names a class packages/ui still styles (%s): a renamed one would turn its readings off-scale',
    (anchor) => {
      const rule = ruleOf(anchor);

      expect(rule).not.toBeNull();
    },
  );

  it.each(LEDGER.exempt.map((entry) => [entry.anchor, entry]))(
    'exempts a padding the class still authors off the scale (%s): a fixed one leaves a dead entry',
    (anchor, entry) => {
      const paddings = [
        ...(ruleOf(anchor) ?? '').matchAll(/padding[\w-]*\s*:\s*([^;]+)/g),
      ];

      expect(paddings.map((match) => match[1])).toContainEqual(
        expect.stringContaining(`${entry.px / 16}rem`),
      );
    },
  );
});

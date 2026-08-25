/**
 * The stylesheet layout contract.
 *
 * Every rule lives beside the component that draws it; styles.css is the
 * manifest naming them, and the order it names them in *is* their cascade
 * order. Both facts are load-bearing and neither is visible to a type or a
 * render test:
 *
 * - A component appending its rules to one shared file is what made styles.css
 *   the wave's worst merge-conflict site, and a conflict resolved mid-rule
 *   nests one component's declarations inside another's — valid CSS that no
 *   suite can see.
 * - Two rules in the system beat the rule they override on source order alone,
 *   at equal specificity. Reordering the manifest changes what they paint and
 *   changes nothing a test would otherwise read.
 *
 * Structural, never appearance: no colour, size or ratio is asserted here, only
 * which file declares which selector and in what order.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss, { type Root } from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'styles.css';

const parseSheet = (sheet: string): Root => {
  const path = join(SRC, sheet);
  return postcss.parse(readFileSync(path, 'utf8'), { from: path });
};

/** Every stylesheet committed under src/, as paths relative to it. */
const sheetsOnDisk = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.css'))
    .sort();

/** The sheets one sheet imports, as paths relative to src/. */
const importsIn = (sheet: string): string[] => {
  const specifiers: string[] = [];

  parseSheet(sheet).walkAtRules('import', (rule) => {
    specifiers.push(rule.params.replace(/^(['"])([\s\S]*)\1$/, '$2'));
  });

  return specifiers.map((specifier) => normalize(join(dirname(sheet), specifier)));
};

/**
 * The import graph flattened into cascade order. An `@import` may only precede
 * the importing sheet's own rules, so a sheet's imports cascade before it.
 */
const flatten = (sheet: string): string[] => [
  ...importsIn(sheet).flatMap(flatten),
  sheet,
];

const CASCADE_ORDER = flatten(MANIFEST);

/** Every selector the system declares, in the order a browser reads them. */
const CASCADED_SELECTORS = CASCADE_ORDER.flatMap((sheet) => {
  const selectors: string[] = [];
  parseSheet(sheet).walkRules((rule) => {
    selectors.push(rule.selector);
  });
  return selectors;
});

const cascadeIndex = (selector: string): number => {
  const index = CASCADED_SELECTORS.indexOf(selector);
  if (index === -1) throw new Error(`no rule declares ${selector}`);
  return index;
};

/** Sheets that belong to no component: the tokens, the faces, the globals. */
const GLOBAL_SHEETS = ['fonts.css', 'tokens.css', 'base.css', 'utilities.css', MANIFEST];

const COMPONENT_SHEETS = sheetsOnDisk().filter((sheet) => !GLOBAL_SHEETS.includes(sheet));

/**
 * The pairs that win on source order rather than on specificity — both sides of
 * each are a single class. Their own rules say so in a comment; this is the
 * same claim, mechanised.
 */
const SOURCE_ORDER_OVERRIDES = [
  ['.ds-site-header__brand', '.ds-link'],
  ['.ds-post-card__link', '.ds-link--default'],
] as const;

describe('styles.css', () => {
  it('declares no rule of its own — it is a manifest of imports', () => {
    const ownStatements = parseSheet(MANIFEST)
      .nodes.filter((node) => node.type !== 'comment')
      .filter((node) => !(node.type === 'atrule' && node.name === 'import'))
      .map((node) => (node.type === 'rule' ? node.selector : String(node)));

    expect(ownStatements).toEqual([]);
  });

  it('imports every stylesheet committed under src/, each exactly once', () => {
    // A sheet nobody imports declares rules that never ship; a sheet imported
    // twice duplicates its rules and moves the later copy down the cascade.
    expect([...CASCADE_ORDER].sort()).toEqual(sheetsOnDisk());
  });
});

describe('component sheets', () => {
  it('exist to check', () => {
    expect(COMPONENT_SHEETS.length).toBeGreaterThan(0);
  });

  it.each(COMPONENT_SHEETS)('%s sits beside the component it draws', (sheet) => {
    const component = sheet.replace(/\.css$/, '.tsx');

    expect(existsSync(join(SRC, component))).toBe(true);
  });
});

describe('cascade order', () => {
  it.each(SOURCE_ORDER_OVERRIDES)('%s is declared after %s', (override, base) => {
    expect(cascadeIndex(override)).toBeGreaterThan(cascadeIndex(base));
  });
});

/**
 * The looping-animation contract.
 *
 * A loop is the one thing in this system the differ structurally cannot see.
 * `determinism.mjs` injects `animation: none !important` over `*` before every
 * shot, so a sheet that stopped animating altogether captures byte-identically
 * to one that still does: delete the `animation` line from either component
 * below and all four of its baselines stay green. Appearance tests cannot cover
 * it either — there are no pixels in which the difference exists.
 *
 * So the loop is pinned here, in the same shape and for the same reason as
 * `capture-contract.test.ts` pins EXPECTED_SKIPS: prose is not a tripwire.
 * Removing a loop now fails on the comparison below rather than silently
 * shipping a placeholder that never shimmers or a ring that never turns.
 *
 * Exact equality, not a floor. A THIRD looping animation is the case this
 * really exists for — AGENTS.md and the coding standards both say no component
 * animates on mount and name these two as the exceptions, and a new loop that
 * slipped in unreviewed would make that sentence false in a file nobody diffs.
 *
 * Each loop must also switch itself off under `prefers-reduced-motion` rather
 * than inherit the global clamp in tokens.css, which sets
 * `animation-duration: 0.01ms` — a period at which an infinite animation
 * restarts tens of thousands of times a second and paints an arbitrary frame.
 * That is a determinism guard, not a preference: it is what makes the reduced
 * frame and the captured frame the same frame.
 *
 * Structural, never appearance: which sheets loop and which stop, never what
 * any of them looks like while doing it.
 */
const REDUCED_MOTION = 'prefers-reduced-motion';

/** Every looping animation in the system, and the selector that carries it. */
const EXPECTED_LOOPS: Readonly<Record<string, string>> = {
  // The shimmer sweeping a placeholder that stands in for content still loading.
  'atoms/Skeleton/Skeleton.css': '.ds-skeleton',
  // The ring turning while a job the console started is still running.
  'atoms/Spinner/Spinner.css': '.ds-spinner',
};

/** Whether a declaration sits inside a reduced-motion block. */
const underReducedMotion = (decl: { parent?: unknown }): boolean => {
  for (let node = decl.parent as any; node; node = node.parent) {
    if (node.type === 'atrule' && String(node.params ?? '').includes(REDUCED_MOTION)) {
      return true;
    }
  }

  return false;
};

/** The selectors a sheet animates forever, outside any reduced-motion block. */
const loopingSelectorsIn = (sheet: string): string[] => {
  const selectors = new Set<string>();

  parseSheet(sheet).walkDecls(/^animation(-iteration-count)?$/, (decl) => {
    if (underReducedMotion(decl) || !/\binfinite\b/.test(decl.value)) return;
    if (decl.parent?.type === 'rule') selectors.add((decl.parent as any).selector);
  });

  return [...selectors].sort();
};

/** The selectors a sheet explicitly stops when motion is unwelcome. */
const stoppedSelectorsIn = (sheet: string): string[] => {
  const selectors = new Set<string>();

  parseSheet(sheet).walkDecls('animation', (decl) => {
    if (!underReducedMotion(decl) || decl.value.trim() !== 'none') return;
    if (decl.parent?.type === 'rule') selectors.add((decl.parent as any).selector);
  });

  return [...selectors].sort();
};

const LOOP_ENTRIES = Object.entries(EXPECTED_LOOPS);

describe('looping animations', () => {
  it('loops exactly the animations the standards name as exceptions', () => {
    const looping = sheetsOnDisk().filter(
      (sheet) => loopingSelectorsIn(sheet).length > 0,
    );

    expect(looping).toEqual(Object.keys(EXPECTED_LOOPS).sort());
  });

  it.each(LOOP_ENTRIES)('%s loops on %s', (sheet, selector) => {
    expect(loopingSelectorsIn(sheet)).toContain(selector);
  });

  it.each(LOOP_ENTRIES)('%s stops %s under reduced motion', (sheet, selector) => {
    expect(stoppedSelectorsIn(sheet)).toContain(selector);
  });
});

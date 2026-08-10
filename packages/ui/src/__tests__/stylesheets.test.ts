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

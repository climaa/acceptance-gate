import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import type { ThemeRegistrationRaw } from 'shiki';
import { describe, expect, it } from 'vitest';
import {
  AA_TEXT,
  CODE_GROUND,
  contrastRatio,
  ensureContrast,
  parseHex,
  relativeLuminance,
  withAccessibleTokens,
} from '../lib/shiki-contrast';

/**
 * The colour maths behind the repaired Shiki themes.
 *
 * What is under test is a pure transform on synthetic inputs, not the design
 * system's palette: CODING_STANDARDS reserves "does the rendered page clear AA"
 * for axe on real DOM, and nothing here asserts a ratio for a colour the site
 * actually ships. The one file this suite does read is `tokens.css`, and only to
 * catch `CODE_GROUND` drifting away from the token it restates — a determinism
 * guard of exactly the kind that rule carves out, since a repair aimed at the
 * wrong plate would still compute, still pass, and still be wrong.
 */

/** A ground each direction has to be exercised against. */
const LIGHT = CODE_GROUND.light;
const DARK = CODE_GROUND.dark;

/** The real failures that motivated the module, used as inputs rather than as
 *  expectations: the assertions below are about what the transform does to them,
 *  never about what the shipped theme resolves to. */
const FAILS_ON_LIGHT = '#EA9D34';
const FAILS_ON_DARK = '#768390';

const ratioOf = (colour: string, ground: string) => {
  const front = parseHex(colour);
  const back = parseHex(ground);
  if (front === null || back === null)
    throw new Error(`unparseable: ${colour} ${ground}`);

  return contrastRatio(front, back);
};

describe('parseHex', () => {
  it('reads a six-digit hex', () => {
    expect(parseHex('#ea9d34')).toEqual([234, 157, 52]);
  });

  it('expands a three-digit hex', () => {
    expect(parseHex('#abc')).toEqual(parseHex('#aabbcc'));
  });

  it('ignores case and surrounding whitespace', () => {
    expect(parseHex('  #EA9D34 ')).toEqual(parseHex('#ea9d34'));
  });

  // The transform leaves anything it cannot read alone, so "unreadable" has to be
  // a distinguishable answer rather than a throw or a silent black.
  it.each(['red', '#ea9d34ff', '#12', 'rgb(1,2,3)', ''])('is null for %o', (value) => {
    expect(parseHex(value)).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
  });

  it('is 1 for a colour on itself', () => {
    expect(contrastRatio([234, 157, 52], [234, 157, 52])).toBe(1);
  });

  // The pair the WCAG text itself uses as the AA boundary for small text.
  it('matches the published ratio for #767676 on white', () => {
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
  });

  it('does not depend on argument order', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(
      contrastRatio([255, 255, 255], [0, 0, 0]),
    );
  });
});

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBe(1);
  });
});

describe('ensureContrast', () => {
  it('returns the input untouched when it already clears the threshold', () => {
    const passing = '#111111';

    expect(ensureContrast(passing, LIGHT)).toBe(passing);
  });

  it('returns the input untouched when it cannot be parsed', () => {
    expect(ensureContrast('salmon', LIGHT)).toBe('salmon');
  });

  it('leaves a colour alone when the ground cannot be parsed', () => {
    expect(ensureContrast(FAILS_ON_LIGHT, 'not-a-colour')).toBe(FAILS_ON_LIGHT);
  });

  it('darkens a failing colour against a light ground', () => {
    const repaired = ensureContrast(FAILS_ON_LIGHT, LIGHT);

    expect(ratioOf(FAILS_ON_LIGHT, LIGHT)).toBeLessThan(AA_TEXT);
    expect(ratioOf(repaired, LIGHT)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(relativeLuminance(parseHex(repaired) ?? [0, 0, 0])).toBeLessThan(
      relativeLuminance(parseHex(FAILS_ON_LIGHT) ?? [0, 0, 0]),
    );
  });

  it('lightens a failing colour against a dark ground', () => {
    const repaired = ensureContrast(FAILS_ON_DARK, DARK);

    expect(ratioOf(FAILS_ON_DARK, DARK)).toBeLessThan(AA_TEXT);
    expect(ratioOf(repaired, DARK)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(relativeLuminance(parseHex(repaired) ?? [0, 0, 0])).toBeGreaterThan(
      relativeLuminance(parseHex(FAILS_ON_DARK) ?? [0, 0, 0]),
    );
  });

  // The point of bisecting rather than jumping to black: a repair that overshoots
  // is a redesign of the theme, not a fix to it.
  it('moves by the smallest step that clears the threshold', () => {
    const repaired = ensureContrast(FAILS_ON_LIGHT, LIGHT);

    // One 8-bit step back toward the original must fall short again, which is
    // what "smallest" means once the answer has to be representable.
    const [red, green, blue] = parseHex(repaired) ?? [0, 0, 0];
    const oneStepBack = ratioOf(
      `#${[red + 1, green + 1, blue + 1].map((c) => c.toString(16).padStart(2, '0')).join('')}`,
      LIGHT,
    );

    expect(ratioOf(repaired, LIGHT)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(oneStepBack).toBeLessThan(AA_TEXT);
  });

  it('preserves hue when it darkens, by scaling every channel alike', () => {
    const [red, green, blue] = parseHex(FAILS_ON_LIGHT) ?? [0, 0, 0];
    const [newRed, newGreen, newBlue] = parseHex(
      ensureContrast(FAILS_ON_LIGHT, LIGHT),
    ) ?? [0, 0, 0];

    // Channel ordering is what the eye reads as hue: gold stays gold.
    expect(newRed).toBeGreaterThan(newGreen);
    expect(newGreen).toBeGreaterThan(newBlue);
    expect(newRed / red).toBeCloseTo(newGreen / green, 1);
    expect(newGreen / green).toBeCloseTo(newBlue / blue, 1);
  });

  it('is idempotent', () => {
    const once = ensureContrast(FAILS_ON_LIGHT, LIGHT);

    expect(ensureContrast(once, LIGHT)).toBe(once);
  });

  it('honours a threshold other than the default', () => {
    expect(
      ratioOf(ensureContrast(FAILS_ON_LIGHT, LIGHT, 7), LIGHT),
    ).toBeGreaterThanOrEqual(7);
  });

  // A ground too close to mid-grey cannot carry small text at AA from either
  // direction. The transform hands back the best the axis offers instead of
  // looping forever or pretending it succeeded.
  it('returns the extreme when the threshold is unreachable', () => {
    const repaired = ensureContrast('#808080', '#808080', 21);

    expect(parseHex(repaired)).toEqual([0, 0, 0]);
  });
});

describe('withAccessibleTokens', () => {
  const theme: ThemeRegistrationRaw = {
    name: 'fixture',
    // TextMate's legacy top-level rule list, required by `IRawTheme` and unused by
    // Shiki themes, which carry their rules in `tokenColors` instead.
    settings: [],
    fg: FAILS_ON_LIGHT,
    colors: { 'editor.foreground': FAILS_ON_LIGHT, 'editor.background': '#ffffff' },
    tokenColors: [
      { scope: 'comment', settings: { foreground: FAILS_ON_LIGHT, fontStyle: 'italic' } },
      { scope: 'keyword', settings: { foreground: '#111111' } },
      // `settings` is required by the type, `foreground` is not — a rule that only
      // sets a font style paints no colour and must survive the repair untouched.
      { scope: 'italic-only', settings: { fontStyle: 'bold' } },
    ],
  };

  it('raises every foreground it can paint text with', () => {
    const repaired = withAccessibleTokens(theme, LIGHT);

    expect(ratioOf(repaired.fg ?? '', LIGHT)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      ratioOf(repaired.colors?.['editor.foreground'] ?? '', LIGHT),
    ).toBeGreaterThanOrEqual(AA_TEXT);
    expect(
      ratioOf(repaired.tokenColors?.[0]?.settings?.foreground ?? '', LIGHT),
    ).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('leaves colours it did not have to touch byte-identical', () => {
    const repaired = withAccessibleTokens(theme, LIGHT);

    expect(repaired.tokenColors?.[1]?.settings?.foreground).toBe('#111111');
    // Same object, not merely an equal one: a diff of the result should show
    // exactly which rules the repair had to rewrite.
    expect(repaired.tokenColors?.[1]).toBe(theme.tokenColors?.[1]);
  });

  it('carries through a rule that names no foreground', () => {
    const repaired = withAccessibleTokens(theme, LIGHT);

    expect(repaired.tokenColors?.[2]).toBe(theme.tokenColors?.[2]);
  });

  it('leaves keys it does not understand alone', () => {
    const repaired = withAccessibleTokens(theme, LIGHT);

    expect(repaired.name).toBe('fixture');
    expect(repaired.colors?.['editor.background']).toBe('#ffffff');
  });

  // The argument is a module singleton shared by every importer — repairing it in
  // place would hand the next caller an already-darkened theme to darken again.
  it('does not mutate the theme it was given', () => {
    const before = JSON.stringify(theme);

    withAccessibleTokens(theme, LIGHT);

    expect(JSON.stringify(theme)).toBe(before);
  });
});

/**
 * `CODE_GROUND` restates `--color-code-bg` for both themes. Structural, not
 * appearance: nothing here asks whether a colour looks right or clears a ratio,
 * only whether the constant the repair aims at is still the token the slab is
 * painted with. Aiming at a stale plate computes a clean answer to the wrong
 * question.
 */
describe('CODE_GROUND', () => {
  const tokensCss = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'tokens.css'),
    'utf8',
  );

  /** The last definition wins in the cascade, and the dark block comes second —
   *  so the ordered list of values for a custom property is [light, dark]. */
  const definitionsOf = (property: string): string[] =>
    [...tokensCss.matchAll(new RegExp(`${property}:\\s*([^;]+);`, 'g'))].map(
      ([, value]) => (value ?? '').trim(),
    );

  it('finds the token file it was written against', () => {
    expect(definitionsOf('--color-code-bg')).toHaveLength(2);
  });

  it.each([
    ['light', 0, CODE_GROUND.light],
    ['dark', 1, CODE_GROUND.dark],
  ])('matches --color-code-bg in the %s theme', (_theme, index, expected) => {
    const alias = definitionsOf('--color-code-bg')[index];
    // `--color-code-bg: var(--c-cream-50)` — resolve one hop to the raw token.
    const rawToken = /var\((--[\w-]+)\)/.exec(alias ?? '')?.[1];
    const resolved = definitionsOf(rawToken ?? '')[0];

    expect(resolved?.toLowerCase()).toBe(expected);
  });
});

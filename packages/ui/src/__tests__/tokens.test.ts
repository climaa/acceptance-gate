/**
 * The token contract, made mechanical.
 *
 * tokens.css is parsed here, not mirrored: a TypeScript copy of the palette
 * would be a second source of truth and would drift, which is the exact failure
 * this suite exists to catch. Every assertion below runs against the postcss AST
 * of the real stylesheet, so editing a token is the only way to change a result.
 * The font rules at the foot of the file read fonts.css the same way, and check
 * its `src:` URLs against the bytes actually committed under src/fonts/.
 *
 * Helpers live in this file on purpose. A `src/tokens-helpers.ts` would land in
 * the coverage denominator; this is test infrastructure, not shipped code.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss, { type Declaration, type Root } from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS_CSS = join(SRC, 'tokens.css');
const STYLES_CSS = join(SRC, 'styles.css');
const FONTS_CSS = join(SRC, 'fonts.css');
const FONTS_DIR = join(SRC, 'fonts');

const parseFile = (path: string) =>
  postcss.parse(readFileSync(path, 'utf8'), { from: path });

const declarationsIn = (css: Root, selector: string): Declaration[] => {
  const found: Declaration[] = [];
  css.walkRules(selector, (rule) => {
    rule.walkDecls(/^--/, (decl) => {
      found.push(decl);
    });
  });
  return found;
};

const TOKENS = parseFile(TOKENS_CSS);
const ROOT_DECLS = declarationsIn(TOKENS, ':root');
const DARK_DECLS = declarationsIn(TOKENS, "[data-theme='dark']");

const asMap = (decls: Declaration[]) =>
  new Map(decls.map((decl) => [decl.prop, decl.value]));

const THEME_NAMES = ['light', 'dark'] as const;

type ThemeName = (typeof THEME_NAMES)[number];

const LIGHT_TOKENS = asMap(ROOT_DECLS);

/**
 * Dark is not a separate scope: `[data-theme='dark']` overrides a subset of
 * `:root`, so a theme's token map is `:root` overlaid by that theme's block.
 * Overlaying the wrong way (or not at all) would make every dark assertion
 * silently re-test the light values, which is why one test asserts the two
 * themes resolve `--color-bg` to different literals.
 */
const THEMES: Record<ThemeName, Map<string, string>> = {
  light: LIGHT_TOKENS,
  dark: new Map([...LIGHT_TOKENS, ...asMap(DARK_DECLS)]),
};

const VAR_REFERENCE = /^var\(\s*(--[\w-]+)\s*\)$/;

/** Follows `var(--x)` chains until a literal remains. */
const resolveToken = (theme: ThemeName, token: string): string => {
  const map = THEMES[theme];
  let value = map.get(token);

  while (value !== undefined) {
    const [, reference] = VAR_REFERENCE.exec(value.trim()) ?? [];
    if (reference === undefined) return value.trim();
    value = map.get(reference);
  }

  throw new Error(`${token} does not resolve to a literal in the ${theme} theme`);
};

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

const HEX = /^#([\da-f]{3}|[\da-f]{6})$/i;
const RGB_FUNCTION = /^rgba?\(([^)]+)\)$/i;

const fromHex = (digits: string): Rgba => {
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  const channel = (index: number) => parseInt(full.slice(index * 2, index * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), a: 1 };
};

const fromRgbFunction = (args: string): Rgba => {
  const [channels = '', alpha] = args.split('/');
  const [r, g, b] = channels
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`rgb() needs three channels: ${args}`);
  }

  return { r, g, b, a: alpha === undefined ? 1 : Number(alpha) };
};

const parseColour = (value: string): Rgba => {
  const [, digits] = HEX.exec(value) ?? [];
  if (digits !== undefined) return fromHex(digits);

  const [, args] = RGB_FUNCTION.exec(value) ?? [];
  if (args !== undefined) return fromRgbFunction(args);

  throw new Error(`not a colour literal: ${value}`);
};

/** Source-over composite of a (possibly translucent) colour on an opaque ground. */
const flatten = (colour: Rgba, ground: Rgba): Rgba => ({
  r: colour.r * colour.a + ground.r * (1 - colour.a),
  g: colour.g * colour.a + ground.g * (1 - colour.a),
  b: colour.b * colour.a + ground.b * (1 - colour.a),
  a: 1,
});

// The real sRGB transfer function, not the raw 0-255 channels: linearizing is
// what separates a correct ratio from a plausible-looking wrong one.
const linearize = (value: number) => {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const luminance = ({ r, g, b }: Rgba) =>
  0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

/** WCAG `(L1 + 0.05) / (L2 + 0.05)`. Both colours must already be opaque. */
const contrastRatio = (front: Rgba, back: Rgba): number => {
  const frontLuminance = luminance(front);
  const backLuminance = luminance(back);
  return (
    (Math.max(frontLuminance, backLuminance) + 0.05) /
    (Math.min(frontLuminance, backLuminance) + 0.05)
  );
};

/**
 * Contrast of one role on another within a theme. Either side may be
 * translucent — `--color-accent-subtle` is `rgb(113 53 32 / 0.08)`, and a ratio
 * against a translucent colour is meaningless — so the background is composited
 * over the theme's own page ground and the foreground over that background.
 */
const roleContrast = (
  theme: ThemeName,
  foreground: string,
  background: string,
): number => {
  const page = parseColour(resolveToken(theme, '--color-bg'));
  const back = flatten(parseColour(resolveToken(theme, background)), page);
  const front = flatten(parseColour(resolveToken(theme, foreground)), back);
  return contrastRatio(front, back);
};

const expectContrast = (theme: ThemeName, fg: string, bg: string, minimum: number) => {
  const ratio = roleContrast(theme, fg, bg);

  expect(
    ratio,
    `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below the ${minimum}:1 minimum`,
  ).toBeGreaterThanOrEqual(minimum);
};

describe('contrast maths', () => {
  it('rates black on white at the maximum 21:1', () => {
    expect(contrastRatio(parseColour('#000'), parseColour('#fff'))).toBe(21);
  });

  it('rates the mid-grey that sits on the AA boundary at 4.54:1', () => {
    expect(contrastRatio(parseColour('#767676'), parseColour('#ffffff'))).toBeCloseTo(
      4.54,
      2,
    );
  });

  it('composites a translucent role over its ground before rating it', () => {
    // Rated raw, the 8%-alpha terracotta of --color-accent-subtle would score as
    // near-black; composited onto the cream page it is the pale chip you see.
    expect(roleContrast('light', '--color-accent', '--color-accent-subtle')).toBeCloseTo(
      6.68,
      1,
    );
  });
});

describe('theme resolution', () => {
  it('resolves --color-bg to a different literal in each theme', () => {
    expect(resolveToken('light', '--color-bg')).not.toBe(
      resolveToken('dark', '--color-bg'),
    );
  });
});

// ---------------------------------------------------------------------------
// Contrast assertions
// ---------------------------------------------------------------------------

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

type Pair = [ThemeName, string, string];

const TEXT_PAIRS: [string, string][] = [
  ['--color-text', '--color-bg'],
  ['--color-text', '--color-bg-subtle'],
  ['--color-text', '--color-bg-muted'],
  ['--color-text-muted', '--color-bg'],
  ['--color-accent', '--color-bg'], // links
  ['--color-text-inverted', '--color-accent'], // primary button
  ['--color-success-fg', '--color-success-surface'],
  ['--color-warning-fg', '--color-warning-surface'],
  ['--color-danger-fg', '--color-danger-surface'],
  ['--color-on-danger-solid', '--color-danger-solid'],
  ['--color-code-fg', '--color-code-bg'],
];

const ALL_TEXT_PAIRS: Pair[] = THEME_NAMES.flatMap((theme) =>
  TEXT_PAIRS.map(([fg, bg]): Pair => [theme, fg, bg]),
);

/**
 * One pair does not meet AA today: light `--color-on-danger-solid` on
 * `--color-danger-solid` is 3.28:1 (cream on `#ef4444`). That is a palette
 * defect, and the palette is not this suite's to edit — so the assertion is not
 * relaxed. `it.fails` runs the identical `expectContrast` call and asserts only
 * that it currently throws, which means retuning the red makes this row go red
 * too: delete the row then and the pair joins the enforced table above it.
 */
const KNOWN_AA_GAPS: Pair[] = [
  ['light', '--color-on-danger-solid', '--color-danger-solid'],
];

const KNOWN_AA_GAP_KEYS = new Set(KNOWN_AA_GAPS.map((pair) => pair.join(' ')));

const ENFORCED_TEXT_PAIRS = ALL_TEXT_PAIRS.filter(
  (pair) => !KNOWN_AA_GAP_KEYS.has(pair.join(' ')),
);

describe('text contrast (WCAG AA)', () => {
  it.each(ENFORCED_TEXT_PAIRS)(`%s: %s on %s meets ${AA_TEXT}:1`, (theme, fg, bg) =>
    expectContrast(theme, fg, bg, AA_TEXT),
  );

  it.fails.each(KNOWN_AA_GAPS)(
    '%s: %s on %s is a known AA gap — retune the palette, then drop this row',
    (theme, fg, bg) => expectContrast(theme, fg, bg, AA_TEXT),
  );
});

describe('non-text contrast (WCAG 2.1 SC 1.4.11)', () => {
  // The focus ring only. SC 1.4.11 covers boundaries *required to identify a
  // component*; --color-border and --color-border-strong are decorative cream
  // hairlines here (light --color-border-strong sits near 1.6:1 on --color-bg,
  // by design), so asserting them would push the palette to satisfy a rule that
  // does not apply to it. The light ring lands at 3.37:1 — the threshold is
  // doing real work on the one role that needs it, so do not soften it either.
  it.each(THEME_NAMES)(
    `%s: --color-focus-ring on --color-bg meets ${AA_NON_TEXT}:1`,
    (theme) => expectContrast(theme, '--color-focus-ring', '--color-bg', AA_NON_TEXT),
  );
});

// ---------------------------------------------------------------------------
// Structural rules (the four in the tokens.css header)
// ---------------------------------------------------------------------------

// Everything that consumes tokens: the stylesheet and every component. This
// file is a `.ts` and so is never scanned — it names raw steps as data, which is
// the enforcement rather than a violation of it.
const consumerFiles = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tsx') || entry === 'styles.css')
    .sort();

/**
 * A role opts out of the dark remap with a trailing comment on its own line
 * saying `theme-invariant`. Deliberately the trailing comment and not the
 * preceding one: tokens.css heads each group with a block comment, so keying off
 * that would exempt every role underneath it.
 */
const isMarkedThemeInvariant = (decl: Declaration): boolean => {
  const next = decl.next();
  return (
    next?.type === 'comment' &&
    !(next.raws.before ?? '').includes('\n') &&
    next.text.includes('theme-invariant')
  );
};

describe('token contract', () => {
  it('never references a raw --c-* step outside tokens.css', () => {
    const escapes = consumerFiles().flatMap((file) =>
      readFileSync(join(SRC, file), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          line.includes('--c-') ? [`${file}:${index + 1}: ${line.trim()}`] : [],
        ),
    );

    expect(escapes).toEqual([]);
  });

  it('references every raw --c-* step from at least one --color-* role', () => {
    const roleValues = [...ROOT_DECLS, ...DARK_DECLS]
      .filter((decl) => decl.prop.startsWith('--color-'))
      .map((decl) => decl.value)
      .join(' ');

    const orphans = ROOT_DECLS.map((decl) => decl.prop)
      .filter((prop) => prop.startsWith('--c-'))
      .filter((prop) => !roleValues.includes(`var(${prop})`));

    expect(orphans).toEqual([]);
  });

  it('remaps every :root --color-* role in the dark theme', () => {
    const remapped = new Set(DARK_DECLS.map((decl) => decl.prop));

    const unremapped = ROOT_DECLS.filter((decl) => decl.prop.startsWith('--color-'))
      .filter((decl) => !remapped.has(decl.prop) && !isMarkedThemeInvariant(decl))
      .map((decl) => decl.prop);

    expect(unremapped).toEqual([]);
  });
});

// Every CSS named colour except `transparent`, which styles.css's header
// declares an absence rather than a palette value (as it does `none` and
// `inherit`, neither of which is a colour keyword at all).
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
   blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
   crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
   darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
   darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
   dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
   gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
   lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
   lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
   lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
   magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
   mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
   mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
   palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
   powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
   seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
   steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
   yellowgreen`.split(/\s+/),
);

const COLOUR_SYNTAX =
  /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

const colourLiteralIn = (value: string): string | undefined => {
  const [syntax] = COLOUR_SYNTAX.exec(value) ?? [];
  if (syntax !== undefined) return syntax;

  return value
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((word) => NAMED_COLOURS.has(word));
};

describe('styles.css', () => {
  it('states no literal colour value — every colour arrives through a role', () => {
    const literals: string[] = [];

    parseFile(STYLES_CSS).walkDecls((decl) => {
      const literal = colourLiteralIn(decl.value);
      if (literal !== undefined) {
        literals.push(`styles.css:${decl.source?.start?.line}: ${decl.prop}: ${literal}`);
      }
    });

    expect(literals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Self-hosted fonts
// ---------------------------------------------------------------------------

/**
 * `src/fonts/og/` is the one documented exemption from the woff2-only rule:
 * next/og renders through satori, which reads neither page CSS nor woff2, so the
 * OG route needs a TTF sibling. Named here so the allowance is a decision — a
 * pattern-shaped exemption would quietly cover anything dropped alongside it.
 */
const FONT_DIR_EXEMPTIONS = ['og'];

/**
 * Families that resolve to whatever face the machine happens to have. One of
 * these in a stack is the whole determinism problem: a local capture and a CI
 * capture would then disagree forever, whatever the baseline says.
 */
const SYSTEM_FAMILIES = new Set(
  [
    'system-ui',
    '-apple-system',
    'ui-sans-serif',
    'ui-monospace',
    'SFMono-Regular',
    'SF Mono',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Menlo',
    'Consolas',
    'Liberation Mono',
  ].map((family) => family.toLowerCase()),
);

/** Permitted only *after* a self-hosted family, as the last-resort keyword. */
const GENERIC_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
]);

const FONT_TOKENS = ['--font-sans', '--font-mono'] as const;

const unquote = (value: string) => value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2');

/**
 * A font token's declared stack: `'Inter', sans-serif` → `['Inter', 'sans-serif']`.
 * Font stacks nest no commas, so splitting on one is enough. Read from the light
 * map because typography carries no colour and never remaps per theme.
 */
const familyStack = (token: string) =>
  resolveToken('light', token).split(',').map(unquote);

/** One parsed `@font-face` rule — not the DOM `FontFace` of the same name. */
type FontFaceRule = {
  label: string;
  family: string;
  descriptors: Map<string, string>;
};

const fontFaces = (css: Root): FontFaceRule[] => {
  const faces: FontFaceRule[] = [];

  css.walkAtRules('font-face', (rule) => {
    const descriptors = new Map<string, string>();
    rule.walkDecls((decl) => {
      descriptors.set(decl.prop, decl.value);
    });

    const family = unquote(descriptors.get('font-family') ?? '');
    const weight = descriptors.get('font-weight') ?? 'no weight';
    faces.push({ label: `${family} ${weight}`, family, descriptors });
  });

  return faces;
};

const FACES = fontFaces(parseFile(FONTS_CSS));
/** `it.each` rows: the label leads so `%s` names the face under test. */
const FACE_ROWS = FACES.map((face) => [face.label, face] as const);
const SELF_HOSTED_FAMILIES = new Set(FACES.map((face) => face.family));

const URL_FUNCTION = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/** The paths a face's `src:` names, relative to fonts.css (which sits in src/). */
const sourceUrls = (face: FontFaceRule) =>
  [...(face.descriptors.get('src') ?? '').matchAll(URL_FUNCTION)].map(
    (match) => match[2] ?? '',
  );

const fontFileEntries = () =>
  readdirSync(FONTS_DIR, { recursive: true, encoding: 'utf8' }).filter(
    (entry) => !statSync(join(FONTS_DIR, entry)).isDirectory(),
  );

describe('font tokens', () => {
  it.each(FONT_TOKENS)('%s leads with a family fonts.css self-hosts', (token) => {
    const [leading] = familyStack(token);

    expect([...SELF_HOSTED_FAMILIES]).toContain(leading);
  });

  it.each(FONT_TOKENS)('%s names no system-resolved family', (token) => {
    const systemFamilies = familyStack(token).filter((family) =>
      SYSTEM_FAMILIES.has(family.toLowerCase()),
    );

    expect(systemFamilies).toEqual([]);
  });

  it.each(FONT_TOKENS)('%s falls back only to a generic keyword', (token) => {
    // The generic last resort stays: it is not a system-stack alias, and Wave 4's
    // `fonts.check()` assertion is the real guard against one being painted.
    const fallbacks = familyStack(token).slice(1);

    expect(fallbacks.filter((family) => !GENERIC_FAMILIES.has(family))).toEqual([]);
  });

  it('gives each font token a family of its own', () => {
    // Catches the copy-paste, not a full swap: which of two self-hosted families
    // is the monospaced one is a question only the font metrics can answer.
    const leading = FONT_TOKENS.map((token) => familyStack(token)[0]);

    expect(new Set(leading).size).toBe(FONT_TOKENS.length);
  });
});

describe('fonts.css', () => {
  it('is imported by styles.css', () => {
    const imported: string[] = [];

    parseFile(STYLES_CSS).walkAtRules('import', (rule) => {
      imported.push(unquote(rule.params));
    });

    expect(imported).toContain('./fonts.css');
  });

  it('declares a face for every weight a --weight-* token asks for', () => {
    const declaredWeights = new Set(
      FACES.map((face) => face.descriptors.get('font-weight')),
    );

    const tokenWeights = ROOT_DECLS.filter((decl) =>
      decl.prop.startsWith('--weight-'),
    ).map((decl) => decl.value);

    expect(tokenWeights.filter((weight) => !declaredWeights.has(weight))).toEqual([]);
  });

  it('resolves every src: URL to a file on disk', () => {
    // A half-copied set does not error — it renders as a fallback, silently, and
    // only a byte-wise screenshot diff two waves later would notice.
    const missing = FACES.flatMap((face) =>
      sourceUrls(face)
        .filter((url) => !existsSync(resolve(SRC, url)))
        .map((url) => `${face.label}: ${url}`),
    );

    expect(missing).toEqual([]);
  });

  it.each(FACE_ROWS)('%s blocks rather than swaps', (_label, face) => {
    expect(face.descriptors.get('font-display')).toBe('block');
  });

  it.each(FACE_ROWS)('%s is bounded by a unicode-range', (_label, face) => {
    expect(face.descriptors.get('unicode-range')).toMatch(/^U\+/i);
  });
});

describe('src/fonts/', () => {
  it('holds only woff2 binaries and licence texts', () => {
    const unexpected = fontFileEntries()
      .filter((entry) => !FONT_DIR_EXEMPTIONS.includes(dirname(entry)))
      .filter((entry) => !/\.(woff2|txt)$/.test(entry));

    expect(unexpected).toEqual([]);
  });

  it('carries one licence text per self-hosted family', () => {
    const licences = fontFileEntries().filter((entry) => entry.endsWith('.txt'));

    expect(licences).toHaveLength(SELF_HOSTED_FAMILIES.size);
  });

  it('commits no woff2 that fonts.css never references', () => {
    const referenced = new Set(
      FACES.flatMap(sourceUrls)
        .filter((url) => url.endsWith('.woff2'))
        .map((url) => basename(url)),
    );

    const orphans = fontFileEntries()
      .filter((entry) => entry.endsWith('.woff2'))
      .filter((entry) => !referenced.has(basename(entry)));

    expect(orphans).toEqual([]);
  });
});

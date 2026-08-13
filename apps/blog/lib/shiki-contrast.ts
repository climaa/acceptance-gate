/**
 * Repairing a syntax theme's contrast against the plate it is actually painted on.
 *
 * Syntax themes are designed to look right, not to clear WCAG. Measured against
 * this site's code ground, `rose-pine-dawn` fails 4.5:1 on four of its nine token
 * colours — worst `#EA9D34` at 1.95:1 — and `github-dark-dimmed` on one,
 * `#768390` at 4.34:1. Picking a different theme is not a fix: no light theme in
 * Shiki's bundle clears 4.5:1 on this ground (`github-light`, the closest,
 * still fails three), so any candidate needs the same repair.
 *
 * `keepBackground: false` is what makes this the app's problem rather than the
 * theme's. The theme's own background is discarded and its tokens land on
 * `--color-code-bg` instead, which is a plate the theme's author never saw.
 *
 * So the theme is repaired rather than replaced: a token colour that fails moves
 * away from the ground by the SMALLEST amount that clears the threshold, and one
 * that already passes is returned untouched — byte-identical, same object. Hue
 * survives, because moving toward black scales all three channels by one factor.
 *
 * This module computes colours; it does not assert them. Whether the rendered
 * page is accessible is axe's claim, made on real DOM by the
 * `An article with code blocks…` scenario in `apps/e2e/features/a11y.feature`.
 * CODING_STANDARDS: contrast is axe's, never the differ's and never a token-pair
 * test's.
 */

import type { ThemeRegistrationRaw } from 'shiki';

/** WCAG 2.1 AA for text below the large-text cutoff. Code is always small text. */
export const AA_TEXT = 4.5;

export type Rgb = readonly [number, number, number];

/**
 * `--color-code-bg` resolved per theme — `--c-cream-50` and `--c-ink-900`.
 *
 * Duplicated from `packages/ui/src/tokens.css` on purpose, the same way
 * `feeds.test.ts` restates the site's static routes: a constant that reads the
 * sheet it is meant to track cannot catch the sheet moving underneath it. The
 * drift guard in `__tests__/shiki-contrast.test.ts` fails when these two stop
 * agreeing with the token file.
 */
export const CODE_GROUND = { light: '#f5efe0', dark: '#1b1e1b' } as const;

/**
 * The luminance where black and white contrast equally — `√(1.05 × 0.05) − 0.05`.
 * Above it a colour gains more by darkening, below it by lightening, so this is
 * what picks the direction to move a failing token in.
 */
const PIVOT_LUMINANCE = Math.sqrt(1.05 * 0.05) - 0.05;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` and `#aabbcc`, the only forms either bundled theme uses. Anything else
 *  — a named colour, an `#rrggbbaa` with real alpha — returns null and is left
 *  alone rather than guessed at. */
export function parseHex(value: string): Rgb | null {
  const body = HEX.exec(value.trim())?.[1];
  if (body === undefined) return null;

  const full =
    body.length === 3 ? [...body].map((channel) => channel + channel).join('') : body;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as unknown as Rgb;

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio, 1 to 21. Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * `rgb` moved `amount` of the way to black or white, rounded to the 8-bit
 * channels a hex string can actually carry — the search below compares the
 * values that get emitted, never an unrepresentable intermediate.
 */
const moveToward = (rgb: Rgb, target: 0 | 255, amount: number): Rgb => [
  Math.round(rgb[0] + (target - rgb[0]) * amount),
  Math.round(rgb[1] + (target - rgb[1]) * amount),
  Math.round(rgb[2] + (target - rgb[2]) * amount),
];

/**
 * `colour` if it already clears `minimum` against `ground`, otherwise the nearest
 * colour along the black/white axis that does.
 *
 * Contrast is monotonic in that direction, which is what makes a bisection sound:
 * every step tests a colour that could really be emitted, so the value returned
 * is one that was measured passing rather than one assumed to.
 */
export function ensureContrast(
  colour: string,
  ground: string,
  minimum: number = AA_TEXT,
): string {
  const front = parseHex(colour);
  const back = parseHex(ground);
  if (front === null || back === null) return colour;
  if (contrastRatio(front, back) >= minimum) return colour;

  const target = relativeLuminance(back) > PIVOT_LUMINANCE ? 0 : 255;

  // Pure black or pure white is the most this axis can offer. If even that falls
  // short the ground itself cannot carry text at this threshold, so hand back the
  // best available rather than looping: axe reports the shortfall on real DOM,
  // which is where a ground that dark or that pale should be argued about.
  const extreme = moveToward(front, target, 1);
  if (contrastRatio(extreme, back) < minimum) return toHex(extreme);

  let failing = 0;
  let passing = 1;
  // 20 halvings resolve the interval far below one 8-bit step (1/255), so the
  // bound converges on the smallest representable change rather than near it.
  for (let step = 0; step < 20; step += 1) {
    const middle = (failing + passing) / 2;
    if (contrastRatio(moveToward(front, target, middle), back) >= minimum) {
      passing = middle;
    } else {
      failing = middle;
    }
  }

  return toHex(moveToward(front, target, passing));
}

/**
 * `theme` with every foreground it can paint text with raised to `minimum`
 * against `ground`.
 *
 * Three places carry one: the theme-wide `fg`, `colors['editor.foreground']`
 * (which Shiki falls back to for unscoped text), and each rule in `tokenColors`.
 * A rule whose colour already passes comes back by reference, so a diff of the
 * result shows exactly which colours the repair had to touch.
 *
 * Never mutates: the argument is a module singleton shared by every import.
 */
export function withAccessibleTokens<T extends ThemeRegistrationRaw>(
  theme: T,
  ground: string,
  minimum: number = AA_TEXT,
): T {
  const repaired: ThemeRegistrationRaw = { ...theme };

  if (theme.fg !== undefined) {
    repaired.fg = ensureContrast(theme.fg, ground, minimum);
  }

  const editorForeground = theme.colors?.['editor.foreground'];
  if (theme.colors !== undefined && editorForeground !== undefined) {
    repaired.colors = {
      ...theme.colors,
      'editor.foreground': ensureContrast(editorForeground, ground, minimum),
    };
  }

  if (theme.tokenColors !== undefined) {
    repaired.tokenColors = theme.tokenColors.map((rule) => {
      // `settings` is required by IRawThemeSetting; only `foreground` is optional,
      // and a rule that sets just `fontStyle` paints no colour to repair.
      const foreground = rule.settings.foreground;
      if (foreground === undefined) return rule;

      const fixed = ensureContrast(foreground, ground, minimum);
      if (fixed === foreground) return rule;

      return { ...rule, settings: { ...rule.settings, foreground: fixed } };
    });
  }

  return repaired as T;
}

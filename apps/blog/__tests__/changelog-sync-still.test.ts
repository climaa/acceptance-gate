import fs from 'node:fs';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
// The generator is plain `.mjs` under `// @ts-check`, which is this repo's
// convention for scripts — so its exports are typed and this import needs no
// escape hatch.
import { build, STILL_PATH } from '../scripts/still-from-lottie.mjs';

/**
 * `ChangelogSyncStill.tsx` is generated from `changelog-sync.lottie`, and this
 * is what stops the two drifting.
 *
 * The still is what a reader with `prefers-reduced-motion: reduce` sees instead
 * of the animation — the player is never loaded for them, so the SVG is the
 * whole picture. Nothing else in this repo compares the two: a re-export from
 * Creator that moved the artwork would leave the still showing the previous
 * drawing, every other check would stay green, and the only people who would
 * ever see it are the ones who asked for less movement and are least likely to
 * be the ones testing.
 *
 * Whitespace is collapsed before comparing. The checked-in file has been
 * through Prettier and `build()`'s output has not, and Prettier's whole effect
 * on this file is where it puts the line breaks between JSX attributes — it
 * does not touch an attribute's value, so collapsing runs of whitespace makes
 * the two comparable without making the comparison loose about anything that
 * matters.
 */

const collapse = (source: string) => source.replace(/\s+/g, ' ').trim();

describe('the reduced-motion still', () => {
  it('is the file the generator would write from the shipped .lottie', () => {
    const committed = fs.readFileSync(STILL_PATH, 'utf8');

    expect(collapse(committed)).toBe(collapse(build()));
  });

  /**
   * Colours are emitted as token variables, never as the hex the `.lottie`
   * carries, which is what lets the still follow `[data-theme]` with no
   * observer and no second copy of the palette. A generator change that started
   * writing literals would still pass the comparison above — both sides would
   * be wrong together — so this asks the question separately.
   */
  it('paints with design tokens rather than baked colour', () => {
    const svg = build();

    expect(svg).toMatch(/var\(--color-/);
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg).not.toMatch(/rgba?\(/);
  });

  /** The pointer-catching rectangle is the full canvas. Drawn, it would be a slab over everything. */
  it('does not draw the hit area', () => {
    expect(build()).not.toContain('hit-area');
  });
});

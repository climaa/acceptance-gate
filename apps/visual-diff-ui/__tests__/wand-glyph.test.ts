import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';

/**
 * `WandGlyph` in `RunPanel.tsx` and the sample glyph `IconButton.stories.tsx`
 * defines are a deliberate clone (#339) — but visual-diff photographs the
 * story, and the console renders the other copy, so nothing catches the two
 * drifting apart. This is that assertion.
 *
 * Read as source text rather than imported: the story is JSX meant for
 * Storybook, not a module this app should start depending on, and reading it
 * as text is what makes `@gate/visual-diff-ui#test`'s turbo `inputs` override
 * (turbo.json) the thing that keeps this honest under a warm cache.
 */

const RUN_PANEL = path.join(process.cwd(), 'components', 'RunPanel.tsx');
const STORY = path.join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'ui',
  'src',
  'atoms',
  'IconButton',
  'IconButton.stories.tsx',
);

/** Where each side's wand starts. The scan runs from there to the first
 *  `</svg>`: the story file also draws the danger row's trash, so a whole-file
 *  scan would compare two glyphs against one. */
const SIDES = [
  { side: 'RunPanel', file: RUN_PANEL, start: 'function WandGlyph(' },
  { side: 'the IconButton story', file: STORY, start: 'const Wand = (' },
];

/** The wand one source file draws: its `<svg viewBox>` and every `<path d>`,
 *  in document order, inside the block that opens at `start`. */
function glyph({ file, start }: { file: string; start: string }): {
  viewBox: string | undefined;
  paths: string[];
} {
  const whole = fs.readFileSync(file, 'utf8');
  const from = whole.indexOf(start);
  // A missing anchor scans nothing, which the `is found in` case below reports.
  const source = from === -1 ? '' : whole.slice(from, whole.indexOf('</svg>', from));

  return {
    viewBox: source.match(/<svg\s[^>]*viewBox="([^"]+)"/)?.[1],
    paths: [...source.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1] ?? ''),
  };
}

describe('the wand glyph', () => {
  // Without this, a rename or a reformat that stopped either side matching would
  // leave two empty scans comparing equal — green while asserting nothing, which
  // is the exact blindness the parity case below exists to end.
  it.each(SIDES)('is found in $side', (side) => {
    const { viewBox, paths } = glyph(side);

    expect(viewBox).toBeDefined();
    expect(paths.length).toBeGreaterThan(0);
  });

  it('draws the same paths and viewBox in RunPanel and the IconButton story', () => {
    const [runPanel, story] = SIDES.map(glyph);

    expect(runPanel).toEqual(story);
  });
});

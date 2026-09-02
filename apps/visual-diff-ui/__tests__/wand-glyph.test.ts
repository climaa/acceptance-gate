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

const SIDES = [
  { side: 'RunPanel', file: RUN_PANEL },
  { side: 'the IconButton story', file: STORY },
];

/** The glyph one source file draws: its `<svg viewBox>` and every `<path d>`,
 *  in document order. Each of the two files holds exactly one `<svg>`, which is
 *  what lets the scan be whole-file rather than scoped to the glyph block. */
function glyph(file: string): { viewBox: string | undefined; paths: string[] } {
  const source = fs.readFileSync(file, 'utf8');

  return {
    viewBox: source.match(/<svg\s[^>]*viewBox="([^"]+)"/)?.[1],
    paths: [...source.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1] ?? ''),
  };
}

describe('the wand glyph', () => {
  // Without this, a rename or a reformat that stopped either side matching would
  // leave two empty scans comparing equal — green while asserting nothing, which
  // is the exact blindness the parity case below exists to end.
  it.each(SIDES)('is found in $side', ({ file }) => {
    const { viewBox, paths } = glyph(file);

    expect(viewBox).toBeDefined();
    expect(paths.length).toBeGreaterThan(0);
  });

  it('draws the same paths and viewBox in RunPanel and the IconButton story', () => {
    expect(glyph(RUN_PANEL)).toEqual(glyph(STORY));
  });
});

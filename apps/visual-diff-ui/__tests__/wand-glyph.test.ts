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

/** Every `<path d="...">` value inside `source`, in document order. */
function pathDs(source: string): string[] {
  return [...source.matchAll(/<path d="([^"]+)"/g)].map((match) => match[1] ?? '');
}

/** The `<svg viewBox="...">` value in `source`. */
function viewBox(source: string): string | undefined {
  return source.match(/<svg\s[^>]*viewBox="([^"]+)"/)?.[1];
}

describe('the wand glyph', () => {
  it('draws the same paths and viewBox in RunPanel and the IconButton story', () => {
    const runPanel = fs.readFileSync(RUN_PANEL, 'utf8');
    const story = fs.readFileSync(STORY, 'utf8');

    expect(viewBox(runPanel)).toBe(viewBox(story));
    expect(pathDs(runPanel)).toEqual(pathDs(story));
  });
});

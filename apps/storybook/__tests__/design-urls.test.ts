import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as staticUrls from '../.storybook/design-urls';

/**
 * A static build answers the console's board addresses with files.
 *
 * `main.ts` swaps the console's `@/lib/design-urls` for `.storybook/design-urls.ts`,
 * and `staticDirs` serves `designs/exports` at `/designs`. The failure this holds
 * is silent: an address that names no exported file is a 404 behind a screen that
 * still builds, and a function the console gains with no stand-in here is an
 * import that resolves to `undefined` only once a story calls it.
 */

const STORYBOOK_DIR = path.resolve(import.meta.dirname, '..');
const EXPORTS_DIR = path.resolve(STORYBOOK_DIR, '..', '..', 'designs', 'exports');
const CONSOLE_URLS = path.resolve(
  STORYBOOK_DIR,
  '..',
  'visual-diff-ui',
  'lib',
  'design-urls.ts',
);

/** The file a `/designs/<file>` address is served from, as `staticDirs` maps it. */
const servedFile = (url: string) => {
  const prefix = '/designs/';
  expect(url.startsWith(prefix)).toBe(true);
  return path.join(EXPORTS_DIR, url.slice(prefix.length));
};

const exportedFiles = fs.readdirSync(EXPORTS_DIR);

/** Every board: a PNG with its export sidecar beside it, named as the console
 *  names it. A PNG with no sidecar (an illustration a doc embeds) is no board. */
const boards = exportedFiles
  .filter((file) => file.endsWith('.png'))
  .map((file) => file.slice(0, -'.png'.length))
  .filter((stem) => exportedFiles.includes(`${stem}.json`));

/** The boards that also carry a tile map: only the tier boards do. */
const tiledBoards = exportedFiles
  .filter((file) => file.endsWith('.tiles.json'))
  .map((file) => file.slice(0, -'.tiles.json'.length));

describe('the static board addresses', () => {
  it('stand in for every address the console exports, and only those', () => {
    const consoleSource = fs.readFileSync(CONSOLE_URLS, 'utf8');
    const consoleNames = [...consoleSource.matchAll(/^export const (\w+)/gm)].map(
      ([, name = '']) => name,
    );

    expect(Object.keys(staticUrls).sort()).toEqual(consoleNames.sort());
  });

  it('point a board at its PNG under /designs', () => {
    expect(staticUrls.designBoardUrl('01-atoms')).toBe('/designs/01-atoms.png');
  });

  it('point a board at its export sidecar under /designs', () => {
    expect(staticUrls.designBoardScaleUrl('01-atoms')).toBe('/designs/01-atoms.json');
  });

  it('point a board at its tile map under /designs', () => {
    expect(staticUrls.designBoardTilesUrl('01-atoms')).toBe(
      '/designs/01-atoms.tiles.json',
    );
  });

  it('have boards to check against', () => {
    expect(boards.length).toBeGreaterThan(0);
    expect(tiledBoards.length).toBeGreaterThan(0);
  });

  it.each(boards)('for %s name a PNG and a sidecar the build serves', (board) => {
    expect(fs.existsSync(servedFile(staticUrls.designBoardUrl(board)))).toBe(true);
    expect(fs.existsSync(servedFile(staticUrls.designBoardScaleUrl(board)))).toBe(true);
  });

  it.each(tiledBoards)('for %s name a tile map the build serves', (board) => {
    expect(fs.existsSync(servedFile(staticUrls.designBoardTilesUrl(board)))).toBe(true);
  });

  // The console's 404 branch: a board with no tile map has no file behind it.
  it('for a board with no tile map name a file the build does not serve', () => {
    const untiled = boards.find((board) => !tiledBoards.includes(board));

    expect(untiled).toBeDefined();
    expect(fs.existsSync(servedFile(staticUrls.designBoardTilesUrl(untiled ?? '')))).toBe(
      false,
    );
  });
});

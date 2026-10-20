import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import { joinProblems } from '../board-scale-integrity.mjs';

/**
 * The join between the tier boards' tiles and the variants Storybook plans
 * (designs/STANDARD.md). Every failure is one sentence that names the story and
 * the board, because it is read by whoever added a story without its tile.
 */
const BADGE = 'atoms__desktop__light__atoms-badge--accent';
const BADGE_DARK = 'atoms__desktop__dark__atoms-badge--accent';
const CARD = 'molecules__desktop__light__molecules-card--default';

const check = (
  tiles: Record<string, string[]>,
  planned: string[],
  shared: string[] = [],
): string[] => joinProblems(tiles, planned, shared);

describe('joinProblems', () => {
  it('passes when every planned variant has exactly one tile on its tier board', () => {
    const problems = check({ '01-atoms': [BADGE, BADGE_DARK], '02-molecules': [CARD] }, [
      BADGE,
      BADGE_DARK,
      CARD,
    ]);

    expect(problems).toEqual([]);
  });

  it('names the story and the board a missing tile belongs on', () => {
    const problems = check({ '01-atoms': [BADGE] }, [BADGE, BADGE_DARK]);

    expect(problems).toEqual([
      'atoms-badge--accent (desktop, dark) has no tile on 01-atoms: a new story ships with its tile (designs/STANDARD.md)',
    ]);
  });

  it('names a tile whose variant Storybook does not plan', () => {
    const renamed = 'atoms__desktop__light__atoms-badge--acent';

    const problems = check({ '01-atoms': [renamed] }, []);

    expect(problems).toEqual([
      '01-atoms draws atoms-badge--acent (desktop, light), a variant Storybook does not plan: delete the tile with the story, or rename it with the story',
    ]);
  });

  it('names a tile that is not a variant key', () => {
    const problems = check({ '02-molecules': ['Tile Card'] }, []);

    expect(problems).toEqual([
      '02-molecules has a tile named "Tile Card", which is not a variant key: name it tier__viewport__theme__storyId, or move it off the tier board',
    ]);
  });

  it('names a tile drawn on another tier’s board', () => {
    const problems = check({ '02-molecules': [BADGE] }, [BADGE]);

    expect(problems).toEqual([
      '02-molecules draws atoms-badge--accent (desktop, light), whose tier board is 01-atoms',
    ]);
  });

  it('names a variant drawn on two boards', () => {
    const problems = check({ '01-atoms-1': [BADGE], '01-atoms-2': [BADGE] }, [BADGE]);

    expect(problems).toEqual([
      'atoms-badge--accent (desktop, light) is drawn twice, on 01-atoms-1 and 01-atoms-2',
    ]);
  });

  // A tier board that outgrows one export pages into -1, -2…, and is still that board.
  it('reads a paged tier board as its tier’s board', () => {
    const problems = check({ '01-atoms-2': [BADGE] }, [BADGE]);

    expect(problems).toEqual([]);
  });

  // 00-, 05-, 06- and x- boards are reference: their frames are never joined.
  it('never joins a reference board', () => {
    const problems = check(
      { '00-foundations': ['Palette'], 'x-console-components': [BADGE] },
      [],
    );

    expect(problems).toEqual([]);
  });

  // A child's boards are product-only: a story it shares with the parent is
  // drawn on the parent's boards, so the child needs no tile for it.
  it('asks no tile of a story drawn in the parent', () => {
    const problems = check(
      { '01-atoms': [] },
      [BADGE, BADGE_DARK],
      ['atoms-badge--accent'],
    );

    expect(problems).toEqual([]);
  });
});

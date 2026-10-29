import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
import * as integrity from '../board-scale-integrity.mjs';

const {
  fileProblems,
  joinProblems,
  rawValueProblems,
  rawValueReport,
  readBoard,
  rulesLine,
  sizeScaleDeclared,
  syncProblems,
  variableProblems,
} = integrity;

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
  drawnAhead: string[] = [],
  undrawn: string[] = [],
): string[] => joinProblems(tiles, planned, shared, drawnAhead, undrawn);

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

  // A project drew its boards before writing its stories: the tiles stand
  // until each story lands, and the list of such stories only shrinks.
  it('passes a tile drawn ahead of its story', () => {
    const problems = check(
      { '01-atoms': [BADGE, BADGE_DARK] },
      [],
      [],
      ['atoms-badge--accent'],
    );

    expect(problems).toEqual([]);
  });

  it('names a drawn-ahead story that is written now', () => {
    const problems = check(
      { '01-atoms': [BADGE, BADGE_DARK] },
      [BADGE, BADGE_DARK],
      [],
      ['atoms-badge--accent'],
    );

    expect(problems).toEqual([
      'atoms-badge--accent is written now: strike it off designs/drawn-ahead-stories.json',
    ]);
  });

  it('names a drawn-ahead story that no board draws', () => {
    const problems = check({ '01-atoms': [] }, [], [], ['atoms-badge--accent']);

    expect(problems).toEqual([
      'designs/drawn-ahead-stories.json lists atoms-badge--accent, which no tier board draws: strike it off',
    ]);
  });

  it('still names an unplanned tile whose story is not on the list', () => {
    const problems = check({ '01-atoms': [BADGE] }, [], [], ['molecules-card--default']);

    expect(problems).toEqual([
      '01-atoms draws atoms-badge--accent (desktop, light), a variant Storybook does not plan: delete the tile with the story, or rename it with the story',
      'designs/drawn-ahead-stories.json lists molecules-card--default, which no tier board draws: strike it off',
    ]);
  });

  // A story written before its tiles are drawn, the reverse: no tile is asked
  // of it while it is listed, and the list only shrinks.
  it('asks no tile of a story written ahead of its drawing', () => {
    const problems = check(
      { '01-atoms': [] },
      [BADGE, BADGE_DARK],
      [],
      [],
      ['atoms-badge--accent'],
    );

    expect(problems).toEqual([]);
  });

  it('names an undrawn story that a board draws now', () => {
    const problems = check(
      { '01-atoms': [BADGE, BADGE_DARK] },
      [BADGE, BADGE_DARK],
      [],
      [],
      ['atoms-badge--accent'],
    );

    expect(problems).toEqual([
      'atoms-badge--accent is drawn now: strike it off designs/undrawn-stories.json',
    ]);
  });

  it('names an undrawn story that Storybook does not plan', () => {
    const problems = check({ '01-atoms': [] }, [], [], [], ['atoms-badge--accent']);

    expect(problems).toEqual([
      'designs/undrawn-stories.json lists atoms-badge--accent, which Storybook does not plan: strike it off',
    ]);
  });

  it('still asks a tile of a planned story that is not on the list', () => {
    const problems = check(
      { '01-atoms': [] },
      [BADGE],
      [],
      [],
      ['molecules-card--default'],
    );

    expect(problems).toEqual([
      'atoms-badge--accent (desktop, light) has no tile on 01-atoms: a new story ships with its tile (designs/STANDARD.md)',
      'designs/undrawn-stories.json lists molecules-card--default, which Storybook does not plan: strike it off',
    ]);
  });
});

describe('fileProblems', () => {
  it('passes when every board file has its export and every export its file', () => {
    expect(fileProblems(['01-atoms', '05-pages'], ['05-pages', '01-atoms'])).toEqual([]);
  });

  it('names a board file with no export, and an export with no board file', () => {
    const problems = fileProblems(['01-atoms', '02-molecules'], ['01-atoms', 'pages']);

    expect(problems).toEqual([
      'designs/02-molecules.pen has no export: export the board',
      'exports/pages.png has no designs/pages.pen it was exported from',
    ]);
  });
});

describe('variableProblems', () => {
  it('passes when every board file carries 00-foundations’ variables', () => {
    expect(variableProblems({ '00-foundations': 'a1', '01-atoms': 'a1' })).toEqual([]);
  });

  it('names a board file whose copy of the variables drifted', () => {
    const problems = variableProblems({ '00-foundations': 'a1', '01-atoms': 'b2' });

    expect(problems).toEqual([
      "01-atoms.pen's variables differ from 00-foundations.pen's: copy them across from 00-foundations.pen",
    ]);
  });

  it('names the source board file when it is missing', () => {
    expect(variableProblems({ '01-atoms': 'a1' })).toEqual([
      "designs/00-foundations.pen is missing: it is the variables' source",
    ]);
  });
});

describe('readBoard', () => {
  const VARIABLES = { bg: { type: 'color', value: '#fff' } };
  const document = (children: unknown[], variables: unknown = VARIABLES) => ({
    version: '1',
    themes: { mode: ['light', 'dark'] },
    variables,
    children,
  });
  const tile = (name: string, children: unknown[] = []) => ({
    type: 'frame',
    name,
    children,
  });

  it('reads the tiles under the board, without descending into a tile', () => {
    const board = tile('01-atoms — Atoms', [
      tile('atoms-badge--accent', [
        tile('Tiles', [
          tile(BADGE, [tile('atoms__inner__light__x--y')]),
          tile(BADGE_DARK),
        ]),
      ]),
    ]);

    const read = readBoard(document([tile('Components'), board]), '01-atoms');

    expect({ problems: read.problems, tiles: read.tileNames }).toEqual({
      problems: [],
      tiles: [BADGE, BADGE_DARK],
    });
  });

  it('names a file whose board is named for another stem', () => {
    const read = readBoard(document([tile('01-atom — Atoms')]), '01-atoms');

    expect(read.problems).toEqual([
      'designs/01-atoms.pen must hold one board, named "01-atoms — <title>"; it holds 01-atom',
    ]);
  });

  it('names a file that holds two boards', () => {
    const read = readBoard(
      document([tile('01-atoms — Atoms'), tile('02-molecules — Molecules')]),
      '01-atoms',
    );

    expect(read.problems).toEqual([
      'designs/01-atoms.pen must hold one board, named "01-atoms — <title>"; it holds 01-atoms, 02-molecules',
    ]);
  });

  // Key order is how Pencil happens to write a file, not what its variables are.
  it('fingerprints the variables, not the order their keys were written in', () => {
    const a = readBoard(document([], { x: { value: 1, type: 'n' } }), '00-foundations');
    const b = readBoard(document([], { x: { type: 'n', value: 1 } }), '00-foundations');
    const c = readBoard(document([], { x: { type: 'n', value: 2 } }), '00-foundations');

    expect({
      same: a.fingerprint === b.fingerprint,
      other: a.fingerprint === c.fingerprint,
    }).toEqual({
      same: true,
      other: false,
    });
  });
});

describe('syncProblems', () => {
  it('passes when the tile map lists exactly the tiles the board draws', () => {
    expect(syncProblems('01-atoms', [BADGE, BADGE_DARK], [BADGE_DARK, BADGE])).toEqual(
      [],
    );
  });

  it('names a tile drawn since the export, and one deleted since', () => {
    const problems = syncProblems('01-atoms', [BADGE], [BADGE_DARK]);

    expect(problems).toEqual([
      `01-atoms.pen draws ${BADGE}, which 01-atoms.tiles.json lacks: export 01-atoms.pen again`,
      `01-atoms.tiles.json has ${BADGE_DARK}, which 01-atoms.pen no longer draws: export 01-atoms.pen again`,
    ]);
  });
});

describe('rawValueProblems', () => {
  /** A board with one light tile holding `nodes`. */
  const boardWith = (...nodes: object[]) => ({
    children: [
      {
        name: '01-atoms — Atoms',
        children: [{ name: BADGE, reusable: true, fill: '#ffffff', children: nodes }],
      },
    ],
  });
  const colours = { sizes: false };
  const sizes = { sizes: true };

  it('passes a tile drawn only in variables', () => {
    const board = boardWith({ name: 'Label', fill: '$text', fontSize: '$text-sm' });

    expect(rawValueProblems(board, '01-atoms', sizes)).toEqual([]);
  });

  it('names a raw colour inside a tile', () => {
    const board = boardWith({ name: 'Label', fill: '#111111' });

    expect(rawValueProblems(board, '01-atoms', colours)).toEqual([
      `01-atoms › ${BADGE} › Label has a raw fill #111111: use a variable, or tag the node colour-exempt: <reason>`,
    ]);
  });

  it('passes a tagged swatch, a transparent fill and the tile’s own card', () => {
    const board = boardWith(
      { name: 'Swatch', fill: '#ff0000', context: 'colour-exempt: primitive swatch' },
      { name: 'Clear', fill: '#00000000' },
    );

    expect(rawValueProblems(board, '01-atoms', colours)).toEqual([]);
  });

  it('asks nothing of sizes until the size scale is declared', () => {
    const board = boardWith({ name: 'Label', fontSize: 14, gap: 4 });

    expect(rawValueProblems(board, '01-atoms', colours)).toEqual([]);
  });

  it('names a raw size once the size scale is declared', () => {
    const board = boardWith({ name: 'Row', padding: [2, '$space-1'] });

    expect(rawValueProblems(board, '01-atoms', sizes)).toEqual([
      `01-atoms › ${BADGE} › Row has a raw padding [2,"$space-1"]: use a size variable, or tag the node size-exempt: <reason>`,
    ]);
  });

  it('passes a zero size and a tagged stand-in for a computed one', () => {
    const board = boardWith(
      { name: 'Flush', padding: 0, gap: 0 },
      {
        name: 'Link · underlined (drawn)',
        gap: 1,
        context: 'size-exempt: underline offset',
      },
    );

    expect(rawValueProblems(board, '01-atoms', sizes)).toEqual([]);
  });

  it('holds a Drawing frame on a project board to the same rule', () => {
    const board = {
      children: [
        {
          name: 'x-example — Example',
          children: [
            {
              name: 'Drawing Panel',
              fill: '#ffffff',
              children: [{ name: 'Edge', stroke: '#e2e2e2' }],
            },
          ],
        },
      ],
    };

    expect(rawValueProblems(board, 'x-example', colours)).toEqual([
      'x-example › Drawing Panel › Edge has a raw stroke #e2e2e2: use a variable, or tag the node colour-exempt: <reason>',
    ]);
  });
});

describe('rawValueReport', () => {
  it('tallies what became of every raw value: named, exempt, or the board’s paper', () => {
    const board = {
      children: [
        {
          name: '01-atoms — Atoms',
          children: [
            {
              name: BADGE,
              reusable: true,
              fill: '#ffffff',
              children: [
                { name: 'Label', fill: '#111111', fontSize: 14 },
                { name: 'Swatch', fill: '#ff0000', context: 'colour-exempt: swatch' },
                { name: 'Offset', gap: 1, context: 'size-exempt: underline offset' },
                { name: 'home', fill: '#eeeeee' },
              ],
            },
          ],
        },
      ],
    };

    const { problems, tally } = rawValueReport(board, '01-atoms', { sizes: true });

    expect(tally).toEqual({ colour: 1, size: 1, exempt: 2, chrome: 2 });
    expect(problems).toEqual(rawValueProblems(board, '01-atoms', { sizes: true }));
  });
});

describe('rulesLine', () => {
  const clean = { problems: [], tally: { colour: 0, size: 0, exempt: 6, chrome: 0 } };

  it('prints one ok line per clean board, in the per-board format', () => {
    expect(rulesLine('05-pages', clean, { count: 119, differ: false })).toEqual({
      ok: true,
      lines: [
        'ok   05-pages.pen               colour 0 · size 0 · exempt 6 · chrome 0 · variables 119',
      ],
    });
  });

  it('fails a board whose variables differ from 00-foundations, and says so', () => {
    const { ok, lines } = rulesLine('01-atoms', clean, { count: 3, differ: true });

    expect(ok).toBe(false);
    expect(lines[0]).toMatch(
      /^FAIL 01-atoms\.pen .* \(differ from 00-foundations\.pen\)$/,
    );
  });

  it('lists the first 20 problems beneath a failing board, then how many more', () => {
    const problems = Array.from({ length: 22 }, (_, i) => `problem ${i}`);
    const report = { problems, tally: { colour: 22, size: 0, exempt: 0, chrome: 0 } };

    const { ok, lines } = rulesLine('02-molecules', report, { count: 37, differ: false });

    expect(ok).toBe(false);
    expect(lines).toHaveLength(22);
    expect(lines[1]).toBe('      problem 0');
    expect(lines[21]).toBe('      … 2 more');
  });
});

describe('sizeScaleDeclared', () => {
  it('is on once 00-foundations declares a number variable, and off before', () => {
    expect({
      colourOnly: sizeScaleDeclared({ text: { type: 'color', value: '#111111' } }),
      withScale: sizeScaleDeclared({ 'space-1': { type: 'number', value: 4 } }),
      none: sizeScaleDeclared(undefined),
    }).toEqual({ colourOnly: false, withScale: true, none: false });
  });
});

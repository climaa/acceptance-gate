// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  comparisonHref,
  comparisonPath,
  defaultBoard,
  tierBoards,
  variantBoards,
  isAgainst,
  isComparisonPath,
  isDesignBoard,
  parseComparisonPath,
  reportPath,
} from '../lib/comparison';

/**
 * A comparison's address. Every reader of it — the report's compare buttons,
 * the modal's arrows, the copy-link button, the proxy's redirect and the page's
 * own `<head>` — builds it here, so the link a reviewer copies is the link the
 * proxy accepts.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';

describe('comparisonPath', () => {
  it('nests the variant key under its report', () => {
    const at = comparisonPath(REPORT, KEY);

    expect(at).toBe(`/report/${REPORT}/compare/${KEY}`);
  });

  // A key is `[a-z0-9-]` and `__` today, but the path is built from whatever it
  // is handed: a character the URL grammar reserves must not split the segment.
  it('encodes each segment, so neither can spill into the next', () => {
    const at = comparisonPath('a/b', 'c?d');

    expect(at).toBe('/report/a%2Fb/compare/c%3Fd');
  });
});

describe('comparisonHref', () => {
  it('leaves the default mode out, so a comparison has one bare link', () => {
    const href = comparisonHref(REPORT, KEY, 'diff');

    expect(href).toBe(comparisonPath(REPORT, KEY));
  });

  it('carries any other mode in the query string', () => {
    const href = comparisonHref(REPORT, KEY, 'slider');

    expect(href).toBe(`${comparisonPath(REPORT, KEY)}?mode=slider`);
  });

  // `actual size` is the one mode with a space in it.
  it('encodes a mode with a space in it', () => {
    const href = comparisonHref(REPORT, KEY, 'actual size');

    expect(href).toBe(`${comparisonPath(REPORT, KEY)}?mode=actual+size`);
  });

  it('is the bare path when no mode is given', () => {
    const href = comparisonHref(REPORT, KEY);

    expect(href).toBe(comparisonPath(REPORT, KEY));
  });
});

describe('reportPath', () => {
  it('is where a comparison closes to', () => {
    const at = reportPath(REPORT);

    expect(at).toBe(`/report/${REPORT}`);
  });
});

describe('isComparisonPath', () => {
  it('recognises a comparison', () => {
    const answer = isComparisonPath(comparisonPath(REPORT, KEY));

    expect(answer).toBe(true);
  });

  it('does not mistake the report itself for one', () => {
    const answer = isComparisonPath(reportPath(REPORT));

    expect(answer).toBe(false);
  });

  it('refuses a path with anything after the key', () => {
    const answer = isComparisonPath(`${comparisonPath(REPORT, KEY)}/opengraph-image`);

    expect(answer).toBe(false);
  });
});

describe('parseComparisonPath', () => {
  it('reads back exactly what comparisonPath wrote', () => {
    const parsed = parseComparisonPath(comparisonPath(REPORT, KEY));

    expect(parsed).toEqual({ reportId: REPORT, key: KEY });
  });

  // The proxy, the modal and the report must agree on this round trip for
  // any input, including the characters the URL grammar reserves.
  it('round-trips segments carrying reserved characters', () => {
    const parsed = parseComparisonPath(comparisonPath('a/b', 'c?d'));

    expect(parsed).toEqual({ reportId: 'a/b', key: 'c?d' });
  });

  it('is null for a segment that will not decode, rather than throwing', () => {
    const parsed = parseComparisonPath(`/report/${REPORT}/compare/%`);

    expect(parsed).toBeNull();
  });

  it('is null for the report itself', () => {
    const parsed = parseComparisonPath(reportPath(REPORT));

    expect(parsed).toBeNull();
  });

  it('is null for an empty key', () => {
    const parsed = parseComparisonPath(`/report/${REPORT}/compare/`);

    expect(parsed).toBeNull();
  });
});

describe('defaultBoard', () => {
  // Every tier has its own board, and a variant with no tile map read opens on
  // its tier's.
  it.each([
    ['templates', '04-templates'],
    ['organisms', '03-organisms'],
    ['molecules', '02-molecules'],
    ['atoms', '01-atoms'],
  ] as const)('opens a %s variant on the %s board', (tier, board) => {
    const chosen = defaultBoard({ tier, key: `${tier}__desktop__light__x--y` }, {});

    expect(chosen).toBe(board);
  });

  // One app's screens: a project with a single app keeps `05-screens`
  // (designs/STANDARD.md), so the console's screens open on its first page. So
  // does a screen whose app the policy does not name.
  it.each([
    ['screens-visual-diff-ui-dashboard--sample', '05-screens-1'],
    ['screens-garden-reader-plantscreen--default', '05-screens-1'],
  ] as const)('opens the screen %s on %s', (id, board) => {
    const chosen = defaultBoard(
      { tier: 'screens', key: `screens__mobile__dark__${id}` },
      {},
    );

    expect(chosen).toBe(board);
  });

  it('opens a variant on the board its tile map says draws it', () => {
    const key = 'templates__desktop__light__templates-home--default';

    const chosen = defaultBoard({ tier: 'templates', key }, { [key]: '05-pages' });

    expect(chosen).toBe('05-pages');
  });
});

describe('tierBoards', () => {
  it('is the tier board alone on a tier that is not paged', () => {
    const boards = tierBoards('atoms');

    expect(boards).toEqual(['01-atoms']);
  });
});

describe('variantBoards', () => {
  // A project with one app keeps `05-screens` (designs/STANDARD.md): the
  // console's screens have no board of their own app, so they open on every
  // page of the screens board, in order.
  it("is every page of the screens board for the console's screens", () => {
    const key = 'screens__desktop__light__screens-visual-diff-ui-dashboard--sample';

    const boards = variantBoards({ tier: 'screens', key });

    expect(boards).toEqual([
      '05-screens-1',
      '05-screens-2',
      '05-screens-3',
      '05-screens-4',
    ]);
  });

  it("falls back to the tier's pages for a screen whose app the policy does not name", () => {
    const key = 'screens__desktop__light__screens-garden-reader-plantscreen--default';

    const boards = variantBoards({ tier: 'screens', key });

    expect(boards).toEqual(tierBoards('screens'));
  });
});

describe('isAgainst and isDesignBoard', () => {
  it('accepts the two things a comparison can be read against', () => {
    const accepted = ['before', 'design'].every(isAgainst);

    expect(accepted).toBe(true);
  });

  it('refuses anything else, including no value at all', () => {
    const refused = ['after', '', null].some(isAgainst);

    expect(refused).toBe(false);
  });

  it('refuses a board that is not one of the exports', () => {
    const refused = isDesignBoard('../pages');

    expect(refused).toBe(false);
  });
});

describe('comparisonHref with a design view', () => {
  it('carries against=design', () => {
    const href = comparisonHref(REPORT, KEY, null, { against: 'design' });

    expect(href).toBe(`${comparisonPath(REPORT, KEY)}?against=design`);
  });

  it('carries a picked board alongside it, after the mode', () => {
    const href = comparisonHref(REPORT, KEY, 'slider', {
      against: 'design',
      board: '05-pages',
    });

    expect(href).toBe(
      `${comparisonPath(REPORT, KEY)}?mode=slider&against=design&board=05-pages`,
    );
  });

  // `before` is the default, and a board means nothing while reading against it.
  it('leaves both out when the comparison is read against before', () => {
    const href = comparisonHref(REPORT, KEY, null, {
      against: 'before',
      board: '05-pages',
    });

    expect(href).toBe(comparisonPath(REPORT, KEY));
  });
});

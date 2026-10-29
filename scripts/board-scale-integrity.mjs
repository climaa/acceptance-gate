// Design-board integrity. Fails when a board file, its exports and Storybook's
// planned variants disagree: a PNG and the sidecar stating its scale, a board file
// and its export, a board's drawn tiles and its tile map, or the tiles and the
// planned variants, which must join one to one.
//
// WHY THIS EXISTS. The console's shot view lays a crop of a board over a
// screenshot, and needs to know how many PNG pixels one design pixel became:
// each board is exported at its own scale (designs/STANDARD.md), so the answer
// changes every time a board grows. Each PNG therefore carries a sidecar,
// `<board>.json`, written at export time with the board's size in design pixels
// and the scale it was exported at. A re-export that forgets the sidecar would
// leave a scale that lies without anything going red; this is the red.
//
// WHAT IT CHECKS. Every PNG has a sidecar, and the PNG's own size is the
// sidecar's board size times its scale, to the pixel the exporter rounds to.
//
// THE FILES. Each board is its own file, `designs/<stem>.pen`, exported to
// `exports/<stem>.png`: a board file with no export, or an export with no board
// file, is red, and each file holds exactly one board, named for its stem. A
// `.pen` is plain JSON, so it is read here directly. Variables live inside each
// document, so every board file carries a copy, and each copy must match
// 00-foundations.pen's.
//
// THE TILES. A tier board also carries `<board>.tiles.json`: each tile's variant
// key and its rectangle in that PNG's pixels, which the shot view opens its crop
// on. Each tile file must state its board's scale, every tile must lie inside
// the PNG, and the map must list exactly the tiles the board file draws — a tile
// drawn or deleted since the export makes the console crop by a stale map.
//
// THE VALUES. A raw hex inside a tile never follows the theme, so every fill and
// stroke there is a variable unless its node is tagged `colour-exempt:`. Once a
// project's 00-foundations declares its size scale as number variables, every
// size Pencil can bind (font size and weight, line height, letter spacing, gap,
// padding, radius, stroke width) is held to the same rule, with `size-exempt:` for
// a drawn stand-in of something CSS computes. A project without that scale (this
// one, so far) is checked for colours only.
//
// THE JOIN. Read off the board files themselves: every variant Storybook plans
// has exactly one tile, on its own tier's board; every tile there is a variant
// Storybook plans. A story added without its tile is red, which is the rule "a new story ships with its tile":
// a story an agent writes needs the attended board step before it can pass.
// The planned variants are read off `storybook-static/index.json` by the
// differ's own `planCaptures`, so the join cannot disagree with what is
// photographed. Boards other than 01–04 are reference only and never joined.
//
// WHY A ROOT TURBO TASK (`boards:check`) AND NOT A WORKSPACE TEST: designs/
// belongs to no workspace, and the join needs a Storybook build. The task names
// designs/*.pen, designs/exports/** and this script in its `inputs` and depends on
// `@gate/storybook#build`, so the cache answers only for files it has read.
//
// THE RULES ALONE (`--rules-only`). The values and variables rules need nothing but
// the board files, so this mode applies only those, with no Storybook join and no
// export checks, and prints one line per board. It is for boards that come before
// their stories, and for a designer iterating on a `.pen`:
//
//   ok   05-screens-3.pen           colour 0 · size 0 · exempt 10 · chrome 0 · variables 37
//
// TRACKED FILES ONLY. Boards, their PNGs and their tile maps are listed with `git
// ls-files`, never off the disk: a designer's untracked scratch board and its
// export would otherwise turn a working tree red while a clean checkout of the
// same commit passes. `--rules-only` names an untracked board it skipped, so a
// new board is not mistaken for a passing one.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVariantKey } from '../packages/visual-diff/src/policy.mjs';
import { planCaptures } from '../packages/visual-diff/src/storybook-index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNS = join(ROOT, 'designs');
const EXPORTS = join(DESIGNS, 'exports');
const INDEX = join(ROOT, 'apps', 'storybook', 'storybook-static', 'index.json');
const SHARED = join(ROOT, 'designs', 'shared-stories.json');
const DRAWN_AHEAD = join(ROOT, 'designs', 'drawn-ahead-stories.json');
const UNDRAWN = join(ROOT, 'designs', 'undrawn-stories.json');

/** The board each tier's tiles live on. A board that outgrows one export pages
 *  as `<stem>-1`, `<stem>-2`, … and is still that board. */
export const TIER_BOARDS = {
  atoms: '01-atoms',
  molecules: '02-molecules',
  organisms: '03-organisms',
  templates: '04-templates',
  // A child whose differ captures its app's pages as a `screens` tier.
  screens: '05-screens',
};

const PAGE_SUFFIX = /-\d+$/;
const TIER_STEMS = new Set(Object.values(TIER_BOARDS));

/** The tier board a stem belongs to, or null for a board that is never joined. */
const tierBoardOf = (stem) => {
  const board = stem.replace(PAGE_SUFFIX, '');
  return TIER_STEMS.has(board) ? board : null;
};

/** A variant as a reader names it in a failure: the story, then where it is. */
const named = ({ id, viewport, theme }) => `${id} (${viewport}, ${theme})`;

/**
 * Every way the tier boards' tiles and the planned variants fail to join, one
 * sentence each, naming the story and the board.
 *
 * A child project lists in `designs/shared-stories.json` the stories it shares
 * with acceptance-gate. Those are drawn on the parent's boards, never the
 * child's (its boards are product-only), so a shared story needs no tile here.
 *
 * A project whose boards were drawn before its stories were written lists those
 * stories in `designs/drawn-ahead-stories.json`: their tiles may stand before
 * Storybook plans them. The list only shrinks. A story is struck off once
 * Storybook plans it, and an entry no board draws any more is stale.
 *
 * The reverse, stories written before their tiles are drawn, are listed in
 * `designs/undrawn-stories.json`: Storybook plans them and no tile is asked of
 * them yet. That list only shrinks too. A story is struck off once a board
 * draws it, and an entry Storybook no longer plans is stale.
 *
 * @param {Record<string, readonly string[]>} tileNames  Tile names by board stem.
 * @param {readonly string[]} planned  Every planned variant key.
 * @param {readonly string[]} [shared]  Story ids drawn in the parent instead.
 * @param {readonly string[]} [drawnAhead]  Story ids drawn before they are written.
 * @param {readonly string[]} [undrawn]  Story ids written before they are drawn.
 * @returns {string[]}
 */
export function joinProblems(
  tileNames,
  planned,
  shared = [],
  drawnAhead = [],
  undrawn = [],
) {
  const sharedIds = new Set(shared);
  const aheadIds = new Set(drawnAhead);
  const undrawnIds = new Set(undrawn);
  const problems = [];
  const plannedKeys = new Set(planned);
  const drawnOn = new Map();

  for (const [stem, names] of Object.entries(tileNames)) {
    const board = tierBoardOf(stem);
    if (!board) continue;

    for (const name of names) {
      const variant = parseVariantKey(name);
      if (!variant) {
        problems.push(
          `${stem} has a tile named "${name}", which is not a variant key: name it tier__viewport__theme__storyId, or move it off the tier board`,
        );
        continue;
      }
      if (TIER_BOARDS[variant.tier] !== board) {
        problems.push(
          `${stem} draws ${named(variant)}, whose tier board is ${TIER_BOARDS[variant.tier]}`,
        );
      }
      if (!plannedKeys.has(name) && !aheadIds.has(variant.id)) {
        problems.push(
          `${stem} draws ${named(variant)}, a variant Storybook does not plan: delete the tile with the story, or rename it with the story`,
        );
      }
      if (drawnOn.has(name)) {
        problems.push(
          `${named(variant)} is drawn twice, on ${drawnOn.get(name)} and ${stem}`,
        );
      }
      drawnOn.set(name, stem);
    }
  }

  for (const key of planned) {
    if (drawnOn.has(key)) continue;
    const variant = parseVariantKey(key);
    if (!variant || sharedIds.has(variant.id) || undrawnIds.has(variant.id)) continue;
    problems.push(
      `${named(variant)} has no tile on ${TIER_BOARDS[variant.tier]}: a new story ships with its tile (designs/STANDARD.md)`,
    );
  }

  const plannedIds = new Set(planned.map((key) => parseVariantKey(key)?.id));
  const drawnIds = new Set([...drawnOn.keys()].map((key) => parseVariantKey(key)?.id));
  for (const id of aheadIds) {
    if (plannedIds.has(id)) {
      problems.push(
        `${id} is written now: strike it off designs/drawn-ahead-stories.json`,
      );
    } else if (!drawnIds.has(id)) {
      problems.push(
        `designs/drawn-ahead-stories.json lists ${id}, which no tier board draws: strike it off`,
      );
    }
  }
  for (const id of undrawnIds) {
    if (drawnIds.has(id)) {
      problems.push(`${id} is drawn now: strike it off designs/undrawn-stories.json`);
    } else if (!plannedIds.has(id)) {
      problems.push(
        `designs/undrawn-stories.json lists ${id}, which Storybook does not plan: strike it off`,
      );
    }
  }

  return problems;
}

/** The board whose variables every other board's are held to. */
export const VARIABLES_SOURCE = '00-foundations';

const BOARD_FRAME = /^(\d\d-[a-z0-9-]+|x-[a-z0-9-]+) — /;

/** A board's PNG, by name. Anything else in exports/ is derived from the boards
 *  by another script and is not this check's to hold to a sidecar. */
const BOARD_PNG = /^(\d\d-[a-z0-9-]+|x-[a-z0-9-]+)\.png$/;
/** A tile's name starts with the tier it belongs to: any tier that has a board. */
const TILE_NAME = new RegExp(`^(${Object.keys(TIER_BOARDS).join('|')})__`);

/** JSON with every object's keys sorted, so the same value always prints the same. */
const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);

/** Every node under `node` whose name starts like a variant key, without descending
 *  into one: a tile's own children are its drawing, not more tiles. */
function tileNamesUnder(node) {
  return (node.children ?? []).flatMap((child) =>
    TILE_NAME.test(child.name ?? '') ? [child.name] : tileNamesUnder(child),
  );
}

/**
 * What one board file holds, read straight off the document: a `.pen` is plain JSON
 * (apps/storybook/__tests__/design-source.test.ts pins that), so the drawing itself
 * is checked rather than an export's account of it.
 *
 * @param {{ children?: unknown[], themes?: unknown, variables?: unknown }} document
 * @param {string} stem  The file's stem, which its one board frame must carry.
 * @returns {{ problems: string[], tileNames: string[], fingerprint: string }}
 */
export function readBoard(document, stem) {
  const frames = (document.children ?? []).filter((node) =>
    BOARD_FRAME.test(node.name ?? ''),
  );
  const stems = frames.map((node) => BOARD_FRAME.exec(node.name)[1]);
  const problems =
    stems.length === 1 && stems[0] === stem
      ? []
      : [
          `designs/${stem}.pen must hold one board, named "${stem} — <title>"; it holds ${
            stems.length === 0 ? 'none' : stems.join(', ')
          }`,
        ];
  const fingerprint = createHash('sha256')
    .update(canonical({ themes: document.themes, variables: document.variables }))
    .digest('hex')
    .slice(0, 12);

  return { problems, tileNames: frames.flatMap(tileNamesUnder), fingerprint };
}

/** The sizes Pencil can bind to a variable. Width and height it cannot, so they carry
 *  their token in the node's name (designs/STANDARD.md § Sizes). */
const SIZE_PROPS = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'gap',
  'padding',
  'cornerRadius',
  'strokeWidth',
];
const TILE_ROOT = /^Drawing\b/;
const isVariable = (value) => typeof value === 'string' && value.startsWith('$');
const isTransparent = (value) => value.toUpperCase() === '#00000000';
/** One size, a `[t, r, b, l]`-style list or a per-side object, as its values. */
const sizeValues = (value) =>
  value !== null && typeof value === 'object' ? Object.values(value) : [value];
const tagged = (node, tag) => (node.context ?? '').includes(`${tag}:`);

/**
 * Whether a project's size scale is on its boards: 00-foundations declares it as
 * number variables. Until it does, the size rule asks nothing of its boards.
 *
 * @param {Record<string, { type?: string }> | undefined} variables  00's variables.
 */
export const sizeScaleDeclared = (variables) =>
  Object.values(variables ?? {}).some((variable) => variable.type === 'number');

/**
 * How many raw values a board's tiles hold, by what became of them: named as a
 * problem (`colour`, `size`), let through by a tag (`exempt`), or the board's paper
 * (`chrome`). The `--rules-only` line prints these.
 *
 * @typedef {{ colour: number, size: number, exempt: number, chrome: number }} Tally
 */

/** @returns {Tally} */
const emptyTally = () => ({ colour: 0, size: 0, exempt: 0, chrome: 0 });

/** A node's raw fill and stroke. A drawing's own card (the tile root) and its "home"
 *  chip are the board's paper, which no theme ref ever resolves.
 *  @param {Tally} tally */
function rawColours(node, root, where, tally) {
  const raw = ['fill', 'stroke'].filter((prop) => {
    const value = node[prop];
    return typeof value === 'string' && !isVariable(value) && !isTransparent(value);
  });
  if (tagged(node, 'colour-exempt')) {
    tally.exempt += raw.length;
    return [];
  }
  if (node === root || ['home', 'h'].includes(node.name)) {
    tally.chrome += raw.length;
    return [];
  }
  tally.colour += raw.length;
  return raw.map(
    (prop) =>
      `${where} has a raw ${prop} ${node[prop]}: use a variable, or tag the node colour-exempt: <reason>`,
  );
}

/** A node's raw sizes. Zero is no size at all, so it passes.
 *  @param {Tally} tally */
function rawSizes(node, where, tally) {
  const raw = SIZE_PROPS.filter(
    (prop) =>
      prop in node &&
      !sizeValues(node[prop]).every((value) => value === 0 || isVariable(value)),
  );
  if (tagged(node, 'size-exempt')) {
    tally.exempt += raw.length;
    return [];
  }
  tally.size += raw.length;
  return raw.map(
    (prop) =>
      `${where} has a raw ${prop} ${JSON.stringify(node[prop])}: use a size variable, or tag the node size-exempt: <reason>`,
  );
}

/** The raw colours and sizes in one tile (or `Drawing …` frame), as sentences.
 *  @param {Tally} tally */
function rawInTile(stem, root, sizes, tally) {
  const visit = (node) => {
    const where = `${stem} › ${root.name} › ${node.name ?? node.id}`;
    return [
      ...rawColours(node, root, where, tally),
      ...(sizes ? rawSizes(node, where, tally) : []),
      ...(node.children ?? []).flatMap(visit),
    ];
  };
  return visit(root);
}

/**
 * Every raw colour inside a tile, and every raw size once the project's size scale
 * is on its boards (designs/STANDARD.md § Colour, § Sizes). A tile is a reusable
 * frame; a `Drawing …` frame on a project board is held to the same rule.
 *
 * @param {{ children?: unknown[] }} document  One board file.
 * @param {string} stem
 * @param {{ sizes: boolean }} rules  Whether sizes are checked (sizeScaleDeclared).
 * @returns {string[]}
 */
export function rawValueProblems(document, stem, { sizes }) {
  return rawValueReport(document, stem, { sizes }).problems;
}

/**
 * `rawValueProblems`, with the tally of every raw value it met.
 *
 * @param {{ children?: unknown[] }} document  One board file.
 * @param {string} stem
 * @param {{ sizes: boolean }} rules
 * @returns {{ problems: string[], tally: Tally }}
 */
export function rawValueReport(document, stem, { sizes }) {
  const roots = [];
  const find = (node) => {
    if (node.reusable || TILE_ROOT.test(node.name ?? '')) roots.push(node);
    else for (const child of node.children ?? []) find(child);
  };
  for (const node of document.children ?? []) find(node);
  const tally = emptyTally();
  const problems = roots.flatMap((root) => rawInTile(stem, root, sizes, tally));
  return { problems, tally };
}

/**
 * One board's line in `--rules-only` mode, then the problems beneath it (the first
 * 20, so one broken board cannot bury the others).
 *
 * @param {string} stem
 * @param {{ problems: string[], tally: Tally }} report  Its `rawValueReport`.
 * @param {{ count: number, differ: boolean }} variables  Its variables against 00's.
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function rulesLine(stem, { problems, tally }, variables) {
  const ok = problems.length === 0 && !variables.differ;
  const counts =
    `colour ${tally.colour} · size ${tally.size} · exempt ${tally.exempt} · ` +
    `chrome ${tally.chrome} · variables ${variables.count}`;
  const lines = [
    `${ok ? 'ok  ' : 'FAIL'} ${`${stem}.pen`.padEnd(26)} ${counts}` +
      (variables.differ ? ` (differ from ${VARIABLES_SOURCE}.pen)` : ''),
    ...problems.slice(0, 20).map((problem) => `      ${problem}`),
  ];
  if (problems.length > 20) lines.push(`      … ${problems.length - 20} more`);
  return { ok, lines };
}

/**
 * Every board file against its exports: each `designs/<stem>.pen` is one board, so
 * each has a `<stem>.png`, and each PNG a board file it was exported from.
 *
 * @param {readonly string[]} penStems  Stems of the board files in designs/.
 * @param {readonly string[]} pngStems  Stems of the PNGs in designs/exports/.
 * @returns {string[]}
 */
export function fileProblems(penStems, pngStems) {
  const pens = new Set(penStems);
  const pngs = new Set(pngStems);

  return [
    ...penStems
      .filter((stem) => !pngs.has(stem))
      .map((stem) => `designs/${stem}.pen has no export: export the board`),
    ...pngStems
      .filter((stem) => !pens.has(stem))
      .map(
        (stem) => `exports/${stem}.png has no designs/${stem}.pen it was exported from`,
      ),
  ];
}

/**
 * A tier board's drawing against its tile map. The map is what the console crops
 * by; a tile drawn since the last export, or one deleted since, makes it lie.
 *
 * @param {string} stem
 * @param {readonly string[]} drawn  Tile names in designs/<stem>.pen.
 * @param {readonly string[]} exported  Tile names in exports/<stem>.tiles.json.
 * @returns {string[]}
 */
export function syncProblems(stem, drawn, exported) {
  const inMap = new Set(exported);
  const onBoard = new Set(drawn);

  return [
    ...drawn
      .filter((name) => !inMap.has(name))
      .map(
        (name) =>
          `${stem}.pen draws ${name}, which ${stem}.tiles.json lacks: export ${stem}.pen again`,
      ),
    ...exported
      .filter((name) => !onBoard.has(name))
      .map(
        (name) =>
          `${stem}.tiles.json has ${name}, which ${stem}.pen no longer draws: export ${stem}.pen again`,
      ),
  ];
}

/**
 * Every board file's variables against the source board's. A Pencil document holds
 * its own variables and themes, so each board file carries a copy, and a copy that
 * differs from 00-foundations' has drifted.
 *
 * @param {Readonly<Record<string, string>>} fingerprints  By board stem.
 * @returns {string[]}
 */
export function variableProblems(fingerprints) {
  const source = fingerprints[VARIABLES_SOURCE];
  if (source === undefined) {
    return [`designs/${VARIABLES_SOURCE}.pen is missing: it is the variables' source`];
  }

  return Object.entries(fingerprints)
    .filter(([, fingerprint]) => fingerprint !== source)
    .map(
      ([stem]) =>
        `${stem}.pen's variables differ from ${VARIABLES_SOURCE}.pen's: copy them across from ${VARIABLES_SOURCE}.pen`,
    );
}

/** A PNG's width and height, off its IHDR chunk: bytes 16–23, big-endian. */
function pngSize(file) {
  const header = readFileSync(file).subarray(16, 24);

  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Each PNG against its sidecar. */
function scaleProblems() {
  const problems = [];
  const pngs = trackedIn(EXPORTS).filter((name) => BOARD_PNG.test(name));

  for (const png of pngs) {
    const stem = png.slice(0, -'.png'.length);
    let sidecar;
    try {
      sidecar = readJson(join(EXPORTS, `${stem}.json`));
    } catch {
      problems.push(`${png} has no readable ${stem}.json beside it`);
      continue;
    }

    const actual = pngSize(join(EXPORTS, png));
    for (const side of ['width', 'height']) {
      const stated = Math.round(sidecar[side] * sidecar.scale);
      if (Math.abs(stated - actual[side]) > 1) {
        problems.push(
          `${png} is ${actual[side]} px ${side}, but ${stem}.json says ${sidecar[side]} × ${sidecar.scale} = ${stated}`,
        );
      }
    }
  }

  return { problems, boards: pngs.length };
}

/** Each tile map against its board's scale and PNG; returns the names it read. */
function tileMapProblems() {
  const problems = [];
  const tileNames = {};
  const files = trackedIn(EXPORTS).filter((name) => name.endsWith('.tiles.json'));

  for (const file of files) {
    const stem = file.slice(0, -'.tiles.json'.length);
    let tiles, sidecar, size;
    try {
      tiles = readJson(join(EXPORTS, file));
      sidecar = readJson(join(EXPORTS, `${stem}.json`));
      size = pngSize(join(EXPORTS, `${stem}.png`));
    } catch {
      problems.push(`${file} has no readable ${stem}.png and ${stem}.json beside it`);
      continue;
    }

    tileNames[stem] = Object.keys(tiles.tiles);
    if (tiles.scale !== sidecar.scale) {
      problems.push(
        `${file} was measured at scale ${tiles.scale}, but ${stem}.png is exported at ${sidecar.scale}: export the boards again`,
      );
    }
    for (const [name, [x, y, width, height]] of Object.entries(tiles.tiles)) {
      if (x < 0 || y < 0 || x + width > size.width || y + height > size.height) {
        problems.push(`${file}: the ${name} tile lies outside ${stem}.png`);
      }
    }
  }

  return { problems, tileNames, maps: files.length };
}

/** The stories a child shares with the parent, or none in the parent itself. */
const sharedStories = () => (existsSync(SHARED) ? readJson(SHARED).stories : []);

/** The stories a project drew before writing them, or none. */
const drawnAheadStories = () =>
  existsSync(DRAWN_AHEAD) ? readJson(DRAWN_AHEAD).stories : [];

/** The stories a project wrote before drawing them, or none. */
const undrawnStories = () => (existsSync(UNDRAWN) ? readJson(UNDRAWN).stories : []);

/** The story ids this repository's Storybook plans, sorted: what a child's
 *  `designs/shared-stories.json` lists when the parent prints it. */
function printStories() {
  const { variants } = planCaptures(Object.values(readJson(INDEX).entries));
  const stories = [...new Set(variants.map((variant) => variant.id))].sort();
  const shared = { from: 'climaa/acceptance-gate', stories };
  console.log(JSON.stringify(shared, null, 2));
}

/**
 * The names of the files directly in `dir` that git tracks and that are still on
 * disk, sorted. An untracked scratch board, or its export, is the designer's, not
 * the repository's, and is never read. A tracked file deleted without `git rm` is
 * gone from the tree being checked, so it is left out too rather than crashing the
 * read.
 *
 * @param {string} dir  Absolute, under ROOT.
 * @returns {string[]}
 */
function trackedIn(dir) {
  const out = execFileSync('git', ['ls-files', '--', dir], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((path) => relative(dir, join(ROOT, path)))
    .filter((name) => name !== '' && !name.includes(sep) && existsSync(join(dir, name)))
    .sort();
}

/** The stems of the board files git tracks in designs/. */
const trackedPenStems = () =>
  trackedIn(DESIGNS)
    .filter((name) => name.endsWith('.pen'))
    .map((name) => name.slice(0, -'.pen'.length));

/** The board files in designs/ that git does not track: named, never read. */
const untrackedPenStems = (tracked) =>
  readdirSync(DESIGNS)
    .filter((name) => name.endsWith('.pen'))
    .map((name) => name.slice(0, -'.pen'.length))
    .filter((stem) => !tracked.includes(stem));

/** Every tracked board file, parsed, by stem. */
const readBoardFiles = (stems) =>
  Object.fromEntries(stems.map((stem) => [stem, readJson(join(DESIGNS, `${stem}.pen`))]));

/** Every board file, read: its problems, its tiles and its variables' fingerprint. */
function boardFiles() {
  const problems = [];
  const tileNames = {};
  const fingerprints = {};
  const stems = trackedPenStems();
  const documents = readBoardFiles(stems);
  const sizes = sizeScaleDeclared(documents[VARIABLES_SOURCE]?.variables);

  for (const stem of stems) {
    const board = readBoard(documents[stem], stem);
    problems.push(
      ...board.problems,
      ...rawValueProblems(documents[stem], stem, { sizes }),
    );
    tileNames[stem] = board.tileNames;
    fingerprints[stem] = board.fingerprint;
  }

  return { problems, tileNames, fingerprints, stems };
}

/** `--rules-only`: the values and variables rules, one line per board. */
function rulesOnly() {
  const stems = trackedPenStems();
  const documents = readBoardFiles(stems);
  const sizes = sizeScaleDeclared(documents[VARIABLES_SOURCE]?.variables);
  const boards = Object.fromEntries(
    stems.map((stem) => [stem, readBoard(documents[stem], stem)]),
  );
  const source = boards[VARIABLES_SOURCE]?.fingerprint;
  // With no source there is nothing to compare against, so no board is blamed for
  // drifting from it: the one missing-source line says what is wrong.
  const missing = source === undefined ? variableProblems({}) : [];
  for (const problem of missing) console.log(`FAIL ${problem}`);
  let failed = missing.length > 0;

  for (const stem of stems) {
    const report = rawValueReport(documents[stem], stem, { sizes });
    const variables = {
      count: Object.keys(documents[stem].variables ?? {}).length,
      differ: source !== undefined && boards[stem].fingerprint !== source,
    };
    const { ok, lines } = rulesLine(
      stem,
      { ...report, problems: [...boards[stem].problems, ...report.problems] },
      variables,
    );
    failed ||= !ok;
    for (const line of lines) console.log(line);
  }

  for (const stem of untrackedPenStems(stems)) {
    console.log(`skip ${`${stem}.pen`.padEnd(26)} untracked: \`git add\` it to check it`);
  }

  // exitCode, not exit(): stdout to a pipe is asynchronous, and exiting at once can
  // cut the per-board lines off before they are written.
  process.exitCode = failed ? 1 : 0;
}

function main() {
  if (process.argv.includes('--print-stories')) return printStories();
  if (process.argv.includes('--rules-only')) return rulesOnly();

  const boards = boardFiles();
  const scales = scaleProblems();
  const maps = tileMapProblems();
  const pngStems = trackedIn(EXPORTS)
    .filter((name) => BOARD_PNG.test(name))
    .map((name) => name.slice(0, -'.png'.length));
  const tierStems = boards.stems.filter((stem) => tierBoardOf(stem));
  const problems = [
    ...boards.problems,
    ...fileProblems(boards.stems, pngStems),
    ...scales.problems,
    ...variableProblems(boards.fingerprints),
    ...maps.problems,
    ...tierStems.flatMap((stem) =>
      syncProblems(stem, boards.tileNames[stem], maps.tileNames[stem] ?? []),
    ),
  ];

  if (existsSync(INDEX)) {
    const { variants } = planCaptures(Object.values(readJson(INDEX).entries));
    problems.push(
      ...joinProblems(
        boards.tileNames,
        variants.map((variant) => variant.key),
        sharedStories(),
        drawnAheadStories(),
        undrawnStories(),
      ),
    );
  } else {
    problems.push(
      `no Storybook build at ${INDEX}: run \`pnpm turbo run boards:check\`, which builds it first`,
    );
  }

  if (problems.length > 0) {
    console.error('✗ the design boards disagree with their exports or with Storybook:');
    for (const problem of problems) console.error(`    ${problem}`);
    console.error(
      '  See designs/STANDARD.md: draw the tile, then export the boards again.',
    );
    process.exit(1);
  }

  console.log(
    `✓ design boards OK — ${boards.stems.length} board files, ${maps.maps} tile maps, every planned variant drawn once.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

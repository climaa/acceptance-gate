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
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVariantKey } from '../packages/visual-diff/src/policy.mjs';
import { planCaptures } from '../packages/visual-diff/src/storybook-index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNS = join(ROOT, 'designs');
const EXPORTS = join(DESIGNS, 'exports');
const INDEX = join(ROOT, 'apps', 'storybook', 'storybook-static', 'index.json');
const SHARED = join(ROOT, 'designs', 'shared-stories.json');

/** The board each tier's tiles live on. A board that outgrows one export pages
 *  as `<stem>-1`, `<stem>-2`, … and is still that board. */
export const TIER_BOARDS = {
  atoms: '01-atoms',
  molecules: '02-molecules',
  organisms: '03-organisms',
  templates: '04-templates',
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
 * @param {Record<string, readonly string[]>} tileNames  Tile names by board stem.
 * @param {readonly string[]} planned  Every planned variant key.
 * @param {readonly string[]} [shared]  Story ids drawn in the parent instead.
 * @returns {string[]}
 */
export function joinProblems(tileNames, planned, shared = []) {
  const sharedIds = new Set(shared);
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
      if (!plannedKeys.has(name)) {
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
    if (!variant || sharedIds.has(variant.id)) continue;
    problems.push(
      `${named(variant)} has no tile on ${TIER_BOARDS[variant.tier]}: a new story ships with its tile (designs/STANDARD.md)`,
    );
  }

  return problems;
}

/** The board whose variables every other board's are held to. */
export const VARIABLES_SOURCE = '00-foundations';

const BOARD_FRAME = /^(\d\d-[a-z0-9-]+|x-[a-z0-9-]+) — /;
const TILE_NAME = /^(atoms|molecules|organisms|templates)__/;

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
  const pngs = readdirSync(EXPORTS).filter((name) => name.endsWith('.png'));

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
  const files = readdirSync(EXPORTS).filter((name) => name.endsWith('.tiles.json'));

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

/** The story ids this repository's Storybook plans, sorted: what a child's
 *  `designs/shared-stories.json` lists when the parent prints it. */
function printStories() {
  const { variants } = planCaptures(Object.values(readJson(INDEX).entries));
  const stories = [...new Set(variants.map((variant) => variant.id))].sort();
  const shared = { from: 'climaa/acceptance-gate', stories };
  console.log(JSON.stringify(shared, null, 2));
}

/** Every board file, read: its problems, its tiles and its variables' fingerprint. */
function boardFiles() {
  const problems = [];
  const tileNames = {};
  const fingerprints = {};
  const stems = readdirSync(DESIGNS)
    .filter((name) => name.endsWith('.pen'))
    .map((name) => name.slice(0, -'.pen'.length));

  for (const stem of stems) {
    const board = readBoard(readJson(join(DESIGNS, `${stem}.pen`)), stem);
    problems.push(...board.problems);
    tileNames[stem] = board.tileNames;
    fingerprints[stem] = board.fingerprint;
  }

  return { problems, tileNames, fingerprints, stems };
}

function main() {
  if (process.argv.includes('--print-stories')) return printStories();

  const boards = boardFiles();
  const scales = scaleProblems();
  const maps = tileMapProblems();
  const pngStems = readdirSync(EXPORTS)
    .filter((name) => name.endsWith('.png'))
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

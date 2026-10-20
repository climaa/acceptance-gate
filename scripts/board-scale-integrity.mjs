// Design-board integrity. Fails when a board PNG in designs/exports/ and the
// sidecar that states its scale disagree, or when the tier boards' tiles and
// Storybook's planned variants do not join one to one.
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
// THE TILES. A tier board also carries `<board>.tiles.json`: each tile's variant
// key and its rectangle in that PNG's pixels, which the shot view opens its crop
// on. Each tile file must state its board's scale, and every tile must lie
// inside the PNG.
//
// THE JOIN. Every variant Storybook plans has exactly one tile, on its own
// tier's board; every tile there is a variant Storybook plans. A story added
// without its tile is red, which is the rule "a new story ships with its tile":
// a story an agent writes needs the attended board step before it can pass.
// The planned variants are read off `storybook-static/index.json` by the
// differ's own `planCaptures`, so the join cannot disagree with what is
// photographed. Boards other than 01–04 are reference only and never joined.
//
// WHY A ROOT TURBO TASK (`boards:check`) AND NOT A WORKSPACE TEST: designs/
// belongs to no workspace, and the join needs a Storybook build. The task names
// designs/exports/** and this script in its `inputs` and depends on
// `@gate/storybook#build`, so the cache answers only for files it has read.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVariantKey } from '../packages/visual-diff/src/policy.mjs';
import { planCaptures } from '../packages/visual-diff/src/storybook-index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORTS = join(ROOT, 'designs', 'exports');
const INDEX = join(ROOT, 'apps', 'storybook', 'storybook-static', 'index.json');

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
 * @param {Record<string, readonly string[]>} tileNames  Tile names by board stem.
 * @param {readonly string[]} planned  Every planned variant key.
 * @returns {string[]}
 */
export function joinProblems(tileNames, planned) {
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
    if (!variant) continue;
    problems.push(
      `${named(variant)} has no tile on ${TIER_BOARDS[variant.tier]}: a new story ships with its tile (designs/STANDARD.md)`,
    );
  }

  return problems;
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

function main() {
  const scales = scaleProblems();
  const maps = tileMapProblems();
  const problems = [...scales.problems, ...maps.problems];

  if (existsSync(INDEX)) {
    const { variants } = planCaptures(Object.values(readJson(INDEX).entries));
    problems.push(
      ...joinProblems(
        maps.tileNames,
        variants.map((variant) => variant.key),
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
    `✓ design boards OK — ${scales.boards} boards, ${maps.maps} tile maps, every planned variant drawn once.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

// Lists every tile that draws a component, so a redrawn tile is carried into each
// copy of it in the same PR (designs/STANDARD.md § Tiles).
//
//   node scripts/pen/where-drawn.mjs <frame name>…
//
// A tile on a higher tier board copies a lower tier's frames by hand rather than
// referencing its tile, so Pencil carries a redraw into none of them. A `.pen` is
// plain JSON, so every designs/*.pen is read directly: each line is the board, the
// tile (by variant key) and the path from the tile down to the frame. A dark tile
// is a ref of its light one and is not listed: it follows the light tile's drawing.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVariantKey } from '../../packages/visual-diff/src/policy.mjs';

const DESIGNS = resolve(dirname(fileURLToPath(import.meta.url)), '../../designs');
const USAGE = 'usage: node scripts/pen/where-drawn.mjs [--designs <dir>] <frame name>…';

/** @typedef {{ type?: string, name?: string, children?: PenNode[] }} PenNode */
/** @typedef {{ board: string, tile: string, path: string, count: number }} Row */

/** Every path, as frame names joined by ` / `, from below `node` to a frame named in `names`.
 *  @param {PenNode} node
 *  @param {Set<string>} names
 *  @param {string[]} trail
 *  @returns {string[]} */
function framePaths(node, names, trail = []) {
  return (node.children ?? []).flatMap((child) => {
    const here = [...trail, child.name ?? '?'];
    const hit = child.type === 'frame' && names.has(child.name ?? '');
    return [...(hit ? [here.join(' / ')] : []), ...framePaths(child, names, here)];
  });
}

/** Every tile under `node`, without descending into one: its children are its drawing.
 *  @param {PenNode} node
 *  @returns {PenNode[]} */
function tilesUnder(node) {
  return (node.children ?? []).flatMap((child) =>
    child.type === 'frame' && parseVariantKey(child.name ?? '') !== null
      ? [child]
      : tilesUnder(child),
  );
}

/**
 * The tiles on one board that hold a frame named in `names`, one row per distinct path.
 *
 * @param {{ children?: PenNode[] }} document  One board file, parsed.
 * @param {string} board  The file's stem.
 * @param {string[]} names  Frame names, matched exactly.
 * @returns {Row[]}
 */
export function whereDrawn(document, board, names) {
  const wanted = new Set(names);
  return tilesUnder(document).flatMap((tile) => {
    const counts = new Map();
    for (const path of framePaths(tile, wanted)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
    return [...counts].map(([path, count]) => ({
      board,
      tile: /** @type {string} */ (tile.name),
      path,
      count,
    }));
  });
}

/** @param {Row} row */
const line = ({ board, tile, path, count }) =>
  `${board}  ${tile}  ${path}${count > 1 ? ` ×${count}` : ''}`;

/** @param {string[]} argv */
function parseArgs(argv) {
  const at = argv.indexOf('--designs');
  if (at === -1) return { designs: DESIGNS, names: argv };
  return { designs: resolve(argv[at + 1] ?? ''), names: argv.toSpliced(at, 2) };
}

function main() {
  const { designs, names } = parseArgs(process.argv.slice(2));
  if (names.length === 0) {
    console.error(USAGE);
    process.exit(2);
  }
  const boards = readdirSync(designs)
    .filter((file) => file.endsWith('.pen'))
    .sort();
  for (const file of boards) {
    const document = JSON.parse(readFileSync(join(designs, file), 'utf8'));
    for (const row of whereDrawn(document, file.slice(0, -'.pen'.length), names)) {
      console.log(line(row));
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

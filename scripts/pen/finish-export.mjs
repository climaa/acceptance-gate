// The second half of a board export: turns the manifest scripts/pen/export-boards.js
// prints into the files designs/exports/ holds.
//
//   node scripts/pen/finish-export.mjs <manifest file>
//
// The snippet runs inside Pencil, where `Export` can write only images and names
// each one after its node id. This renames each PNG to its board's stem, writes
// `<stem>.json` (the board's size in design pixels and its export scale) and, for a
// board with tiles, `<stem>.tiles.json` (each tile's variant key and rectangle in
// that PNG's pixels). Anything else in designs/exports/ is a board that no longer
// exists, so it is deleted: the folder holds exactly what the .pen draws.
//
// The manifest file is the line the snippet printed, with or without its
// `MANIFEST ` prefix.
import { readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPORTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'designs',
  'exports',
);

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/pen/finish-export.mjs <manifest file>');
  process.exit(2);
}

const manifest = JSON.parse(
  readFileSync(file, 'utf8')
    .trim()
    .replace(/^MANIFEST\s+/, ''),
);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** A tile map, one tile to a line in key order, so a re-export diffs by the tiles
 *  that moved. .prettierignore keeps Prettier from wrapping the long ones. */
const tileMap = (board, scale, keys, tiles) =>
  [
    '{',
    `  "board": ${JSON.stringify(board)},`,
    `  "scale": ${scale},`,
    '  "tiles": {',
    keys
      .map((key) => `    ${JSON.stringify(key)}: [${tiles[key].join(', ')}]`)
      .join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');

const keep = new Set();

for (const { id, stem, board, width, height, scale, tiles } of manifest) {
  renameSync(join(EXPORTS, `${id}.png`), join(EXPORTS, `${stem}.png`));
  writeFileSync(join(EXPORTS, `${stem}.json`), json({ board, width, height, scale }));
  keep.add(`${stem}.png`).add(`${stem}.json`);

  const keys = Object.keys(tiles).sort();
  if (keys.length === 0) continue;
  writeFileSync(join(EXPORTS, `${stem}.tiles.json`), tileMap(board, scale, keys, tiles));
  keep.add(`${stem}.tiles.json`);
}

for (const name of readdirSync(EXPORTS)) {
  if (keep.has(name)) continue;
  rmSync(join(EXPORTS, name));
  console.log(`removed ${name}`);
}

console.log(`${manifest.length} boards written to designs/exports/`);

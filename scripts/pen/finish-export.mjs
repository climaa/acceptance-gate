// The second half of a board export: turns the manifests scripts/pen/export-boards.js
// prints into the files designs/exports/ holds.
//
//   node scripts/pen/finish-export.mjs <manifest file>…
//
// The snippet runs inside Pencil, where `Export` can write only images and names
// each one after its node id. This renames each PNG to its board's stem, writes
// `<stem>.json` (the board's size in design pixels, its export scale and its
// variables' fingerprint) and, for a board with tiles, `<stem>.tiles.json` (each
// tile's variant key and rectangle in that PNG's pixels).
//
// One manifest per board file, as many as were exported. A board whose
// `designs/<stem>.pen` no longer exists leaves its exports behind, so those are
// deleted: the folder holds exactly what the board files draw.
//
// Each manifest file is the line the snippet printed, with or without its
// `MANIFEST ` prefix.
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGNS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designs');
const EXPORTS = join(DESIGNS, 'exports');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/pen/finish-export.mjs <manifest file>…');
  process.exit(2);
}

const manifest = files.flatMap((file) =>
  JSON.parse(
    readFileSync(file, 'utf8')
      .trim()
      .replace(/^MANIFEST\s+/, ''),
  ),
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

for (const { id, stem, board, width, height, scale, variables, tiles } of manifest) {
  renameSync(join(EXPORTS, `${id}.png`), join(EXPORTS, `${stem}.png`));
  writeFileSync(
    join(EXPORTS, `${stem}.json`),
    json({ board, width, height, scale, variables }),
  );

  const keys = Object.keys(tiles).sort();
  const tileFile = join(EXPORTS, `${stem}.tiles.json`);
  if (keys.length > 0) writeFileSync(tileFile, tileMap(board, scale, keys, tiles));
  else if (existsSync(tileFile)) rmSync(tileFile);
}

/** `01-atoms.tiles.json` → `01-atoms`: the board an export belongs to. */
const stemOf = (name) => name.replace(/(\.tiles)?\.(png|json)$/, '');

for (const name of readdirSync(EXPORTS)) {
  if (existsSync(join(DESIGNS, `${stemOf(name)}.pen`))) continue;
  rmSync(join(EXPORTS, name));
  console.log(`removed ${name}: there is no designs/${stemOf(name)}.pen`);
}

console.log(`${manifest.length} boards written to designs/exports/`);

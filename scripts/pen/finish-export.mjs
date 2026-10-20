// The second half of a board export: turns the manifests scripts/pen/export-boards.js
// prints into the files designs/exports/ holds.
//
//   node scripts/pen/finish-export.mjs <manifest file>…
//
// The snippet runs inside Pencil, where `Export` can write only images and names
// each one after its node id. This renames each PNG to its board's stem, writes
// `<stem>.json` (the board's size in design pixels and its export scale) and, for a
// board with tiles, `<stem>.tiles.json` (each
// tile's variant key and rectangle in that PNG's pixels).
//
// One manifest per board file, as many as were exported. A board whose
// `designs/<stem>.pen` no longer exists leaves its exports behind, so those are
// deleted. Only files named like a board's exports are touched: an image another
// script derives from the boards (a stitched page, a social card) can sit beside
// them in exports/ and is left alone.
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

/** A PNG's width and height, off its IHDR chunk: bytes 16–23, big-endian. */
function pngSize(file) {
  const header = readFileSync(file).subarray(16, 24);

  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

/**
 * The scale and size the PNG was actually written at. The snippet asks for a scale
 * off the board's layout box, but Pencil renders what overflows the box too and
 * caps the result's long side at 8192, so a tall board can come back narrower than
 * asked. The PNG is the truth: its width over the board's gives the scale, and its
 * height over that scale gives the height that was drawn.
 */
function measured({ width, height, scale }, png) {
  const stated = { width: Math.round(width * scale), height: Math.round(height * scale) };
  if (
    Math.abs(stated.width - png.width) <= 1 &&
    Math.abs(stated.height - png.height) <= 1
  ) {
    return { width, height, scale };
  }

  const actual = Math.floor((png.width / width) * 1e6) / 1e6;

  return { width, height: Math.round(png.height / actual), scale: actual };
}

for (const entry of manifest) {
  const { id, stem, board, tiles } = entry;
  const file = join(EXPORTS, `${stem}.png`);
  renameSync(join(EXPORTS, `${id}.png`), file);
  const { width, height, scale } = measured(entry, pngSize(file));
  if (scale !== entry.scale) {
    console.log(
      `${stem}.png came back at scale ${scale}, not ${entry.scale}: sidecars say so`,
    );
  }
  writeFileSync(join(EXPORTS, `${stem}.json`), json({ board, width, height, scale }));

  const ratio = scale / entry.scale;
  const rescaled = Object.fromEntries(
    Object.entries(tiles).map(([key, rect]) => [
      key,
      rect.map((v) => Math.round(v * ratio)),
    ]),
  );
  const keys = Object.keys(rescaled).sort();
  const tileFile = join(EXPORTS, `${stem}.tiles.json`);
  if (keys.length > 0) writeFileSync(tileFile, tileMap(board, scale, keys, rescaled));
  else if (existsSync(tileFile)) rmSync(tileFile);
}

/** `01-atoms.tiles.json` → `01-atoms`: the board a board export belongs to, or
 *  null for anything else in exports/ — an image another script derives from the
 *  boards, which this leaves alone. */
const stemOf = (name) =>
  /^(\d\d-[a-z0-9-]+|x-[a-z0-9-]+)(\.tiles)?\.(png|json)$/.exec(name)?.[1] ?? null;

for (const name of readdirSync(EXPORTS)) {
  const stem = stemOf(name);
  if (stem === null || existsSync(join(DESIGNS, `${stem}.pen`))) continue;
  rmSync(join(EXPORTS, name));
  console.log(`removed ${name}: there is no designs/${stem}.pen`);
}

console.log(`${manifest.length} boards written to designs/exports/`);

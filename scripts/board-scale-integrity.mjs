// Design-board export scale integrity. Fails when a board PNG in
// designs/exports/ and the sidecar that states its scale disagree.
//
// WHY THIS EXISTS. The console's shot view lays a crop of a board over a
// screenshot, and needs to know how many PNG pixels one design pixel became:
// the boards are exported at whatever scale keeps the long side at 8192, so
// the answer changes every time a board grows. Each PNG therefore carries a
// sidecar, `<board>.json`, written at export time with the board's size in
// design pixels and the scale it was exported at. A re-export that forgets the
// sidecar would leave a scale that lies without anything going red; this is
// the red.
//
// WHAT IT CHECKS. Every PNG has a sidecar, and the PNG's own size is the
// sidecar's board size times its scale, to the pixel the exporter rounds to.
//
// THE TILES. A board may also carry `<board>.tiles.json`: each component's
// tile, in that PNG's pixels, which the shot view opens its crop on. Read off
// the .pen through the Pencil MCP, so nothing regenerates it on export; a
// re-export at a new scale would leave every tile pointing at the wrong
// region. So each tile file must state its board's scale, and every tile must
// lie inside the PNG.
//
// WHY HERE AND NOT A WORKSPACE TEST, for the reason index-integrity.mjs gives:
// designs/ belongs to no workspace, and a workspace test reading it would need
// the directory named in that task's turbo `inputs` or the cache would answer
// for files it had not read. Run from `health:check`, there is no cache.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPORTS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'designs',
  'exports',
);

/** A PNG's width and height, off its IHDR chunk: bytes 16–23, big-endian. */
function pngSize(file) {
  const header = readFileSync(file).subarray(16, 24);

  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

const problems = [];
const pngs = readdirSync(EXPORTS).filter((name) => name.endsWith('.png'));

for (const png of pngs) {
  const stem = png.slice(0, -'.png'.length);
  let sidecar;
  try {
    sidecar = JSON.parse(readFileSync(join(EXPORTS, `${stem}.json`), 'utf8'));
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

const tileFiles = readdirSync(EXPORTS).filter((name) => name.endsWith('.tiles.json'));

for (const file of tileFiles) {
  const stem = file.slice(0, -'.tiles.json'.length);
  let tiles, sidecar, size;
  try {
    tiles = JSON.parse(readFileSync(join(EXPORTS, file), 'utf8'));
    sidecar = JSON.parse(readFileSync(join(EXPORTS, `${stem}.json`), 'utf8'));
    size = pngSize(join(EXPORTS, `${stem}.png`));
  } catch {
    problems.push(`${file} has no readable ${stem}.png and ${stem}.json beside it`);
    continue;
  }

  if (tiles.scale !== sidecar.scale) {
    problems.push(
      `${file} was measured at scale ${tiles.scale}, but ${stem}.png is exported at ${sidecar.scale} — read the tiles off the .pen again`,
    );
  }
  for (const [name, [x, y, width, height]] of Object.entries(tiles.tiles)) {
    if (x < 0 || y < 0 || x + width > size.width || y + height > size.height) {
      problems.push(`${file}: the ${name} tile lies outside ${stem}.png`);
    }
  }
}

if (problems.length > 0) {
  console.error('✗ design-board export scales disagree with their PNGs:');
  for (const problem of problems) console.error(`    ${problem}`);
  console.error(
    '  Re-export wrote a new size: update the sidecar with the board size and scale used.',
  );
  process.exit(1);
}

console.log(
  `✓ design-board export scales OK — ${pngs.length} boards, ${tileFiles.length} tile maps.`,
);

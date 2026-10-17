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

if (problems.length > 0) {
  console.error('✗ design-board export scales disagree with their PNGs:');
  for (const problem of problems) console.error(`    ${problem}`);
  console.error(
    '  Re-export wrote a new size: update the sidecar with the board size and scale used.',
  );
  process.exit(1);
}

console.log(`✓ design-board export scales OK — ${pngs.length} boards.`);

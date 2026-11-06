// Subtracts a screenshot from its tile, pixel by pixel, so what a tile got wrong can
// be seen and counted.
//
//   node scripts/pen/tile-diff.mjs <tile.png> <screenshot.png> [out.png]
//
// Black is where the two agree and brightness is how far they differ, so a doubled
// word is text that moved or wrapped elsewhere. Export the tile at scale 1 first: both
// images are cropped to the area they share from the top left, never resized, because
// resizing would blur the very drift this is for.
//
// It prints the mean brightness of the difference, 0 for identical and 255 for
// opposite. Text antialiasing keeps a good tile above 0, so the number compares two
// passes on one tile and is no verdict: it exits 0 whatever it finds. A verdict against
// the baselines is `tiles-from-dom.mjs --verify`. Needs ffmpeg and ffprobe on the PATH.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE =
  'usage: node scripts/pen/tile-diff.mjs <tile.png> <screenshot.png> [out.png]';

/** @typedef {{ width: number, height: number }} Size */

/** The area two images share, measured from their top left corner.
 *  @param {Size} a @param {Size} b @returns {Size} */
export function sharedSize(a, b) {
  return { width: Math.min(a.width, b.width), height: Math.min(a.height, b.height) };
}

/** The filter graph: both inputs cropped to `size` and in one pixel format, which
 *  `blend` requires, then subtracted.
 *  @param {Size} size @returns {string} */
export function diffGraph({ width, height }) {
  const crop = `crop=${width}:${height}:0:0,format=rgb24`;
  return `[0:v]${crop}[a];[1:v]${crop}[b];[a][b]blend=all_mode=difference`;
}

/** Reads the mean brightness out of signalstats' metadata print.
 *  @param {string} text @returns {number | null} */
export function meanBrightness(text) {
  const match = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(text);
  return match ? Number(match[1]) : null;
}

/** Where the difference is written when no path is given: beside the tile.
 *  @param {string} tile @returns {string} */
export function defaultOut(tile) {
  return join(dirname(tile), `${basename(tile, '.png')}.diff.png`);
}

/** @param {string} file @returns {Size} */
function sizeOf(file) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
    ].concat(['-of', 'csv=p=0:s=x', file]),
    { encoding: 'utf8' },
  );
  const [width = 0, height = 0] = out.trim().split('x').map(Number);
  return { width, height };
}

/** @param {readonly string[]} args @returns {string} */
function ffmpeg(args) {
  return execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
}

/** @param {readonly string[]} argv @returns {number} */
function main(argv) {
  const [tile, screenshot, out = tile && defaultOut(tile)] = argv;
  if (!tile || !screenshot || !out) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  const tileSize = sizeOf(tile);
  const shotSize = sizeOf(screenshot);
  const shared = sharedSize(tileSize, shotSize);
  ffmpeg(['-i', tile, '-i', screenshot, '-filter_complex', diffGraph(shared), out]);
  const stats = ffmpeg(
    ['-i', out, '-vf', 'format=gray,signalstats,metadata=print:file=-'].concat([
      '-f',
      'null',
      '-',
    ]),
  );
  const mean = meanBrightness(stats);
  process.stdout.write(
    `${out}\n` +
      `tile ${tileSize.width}x${tileSize.height}, screenshot ${shotSize.width}x${shotSize.height}, ` +
      `compared ${shared.width}x${shared.height}\n` +
      `mean difference ${mean ?? 'unknown'}\n`,
  );
  return 0;
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

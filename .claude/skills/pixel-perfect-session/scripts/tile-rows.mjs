// Reads one variant's tile off its board export and its screenshot, and prints
// both as pixel rows: which rows carry ink (text), which carry a tint (a wash or
// band) and which are plain ground. Two lists of runs read side by side say, to
// the pixel, where a component's text sits against where the board draws it —
// which the console's overlay shows but cannot state, and which a tile that clips
// its overflow (designs/STANDARD.md, "Geometry") misstates once the first card
// drifts.
//
//   node .claude/skills/pixel-perfect-session/scripts/tile-rows.mjs <shot URL | variant key> [--png <file>] [--storybook <origin>]
//
// The one input a session needs is the console's shot view, the page the reader
// was already looking at:
//
//   http://127.0.0.1:3300/set/baselines/shot/atoms__desktop__light__atoms-badge--accent?view=overlay&blend=difference
//
// Its path names the set and the variant key; everything else is derived from
// them and printed first, so the session reads its addresses off this script
// instead of rebuilding them. The screenshot is fetched from the console that
// served the URL, which is how a set that is not `baselines` — a capture taken
// to judge a change before accepting it — is read the same way. A bare variant
// key reads the committed baseline off disk; `--png` reads any file instead.
//
// The export's pixels are the board at its sidecar scale, so the tile's crop is
// box-averaged back to 1:1 before it is classified. An export draws a frame's
// stroke inside its bounds and the differ photographs the DOM's border as a row
// of its own, so a tile's rows read one lower than the shot's at the top edge.
//
// pngjs is `@gate/visual-diff`'s dependency, resolved from that package on
// purpose: this script lives with its skill, outside any workspace package, and
// the differ's PNG reader is the one reader the corpus already trusts.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const { PNG } = createRequire(join(REPO_ROOT, 'packages/visual-diff/package.json'))(
  'pngjs',
);
const { COLOR_SCHEME_GLOBAL, LOCALE_GLOBAL } = await import(
  join(REPO_ROOT, 'packages/visual-diff/src/policy.mjs')
);

const EXPORTS = join(REPO_ROOT, 'designs', 'exports');
const BASELINES = join(REPO_ROOT, 'packages', 'visual-diff', '__baselines__');
const STORYBOOK = 'http://localhost:6006';

/** A pixel reads as ink when its luminance sits this far from the ground's, in
 *  summed RGB. Text in either theme clears it; a wash or a band never does. */
const INK_DISTANCE = 300;
/** A pixel reads as tinted when its channels spread by more than this: the
 *  ground is grey, a wash is not. */
const CHROMA = 6;
/** A row is a tint row when this share of it is tinted: a band, not a dot. */
const TINT_SHARE = 0.3;

/** @typedef {{ width: number, height: number, data: Uint8Array | Buffer }} Image */
/** @typedef {{ tier: string, viewport: string, theme: string, locale?: string, storyId: string }} Variant */
/** @typedef {{ key: string, origin?: string, label: string }} Target */

/** The shot view's path is `/set/<label>/shot/<key>`; anything else is a variant
 *  key typed by hand, which reads the committed baselines.
 *  @param {string} arg @returns {Target} */
function parseTarget(arg) {
  if (!/^https?:\/\//.test(arg)) return { key: arg, label: 'baselines' };

  const url = new URL(arg);
  const match = url.pathname.match(/^\/set\/([^/]+)\/shot\/([^/]+)\/?$/);
  if (!match)
    throw new Error(`${arg} is not a shot view — expected /set/<label>/shot/<key>`);

  return {
    origin: url.origin,
    label: decodeURIComponent(match[1]),
    key: decodeURIComponent(match[2]),
  };
}

/** A variant key is tier, viewport, theme and story id joined by `__`, with a
 *  locale between the theme and the story id for a story listed for that axis.
 *  @param {string} key @returns {Variant} */
function parseKey(key) {
  const parts = key.split('__');
  if (parts.length === 4) {
    const [tier, viewport, theme, storyId] = parts;
    return { tier, viewport, theme, storyId };
  }
  if (parts.length === 5) {
    const [tier, viewport, theme, locale, storyId] = parts;
    return { tier, viewport, theme, locale, storyId };
  }
  throw new Error(`${key} is not a variant key — tier__viewport__theme__story-id`);
}

const USAGE =
  'usage: tile-rows.mjs <shot URL | variant key> [--png <file>] [--storybook <origin>]';

/** A failure the reader caused: printed as one line, with the usage, and no
 *  stack — a missing argument is not a bug in this script. @param {string} why */
function usageError(why) {
  process.stderr.write(`${why}\n${USAGE}\n`);
  process.exit(2);
}

/** @param {string} argv0 @param {string[]} rest */
function parseArgs(argv0, rest) {
  /** @type {{ png: string | undefined, storybook: string }} */
  const flags = { png: undefined, storybook: STORYBOOK };
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (value === undefined || value.startsWith('--'))
      usageError(`${flag} needs a value`);
    if (flag === '--png') flags.png = resolve(value);
    else if (flag === '--storybook') flags.storybook = value.replace(/\/$/, '');
    else usageError(`unknown flag ${flag}`);
  }
  return { target: parseTarget(argv0), ...flags };
}

/** How long the console or Storybook may take to answer. Both are local dev
 *  servers: past this, one is hung, and waiting longer would not change that. */
const FETCH_TIMEOUT_MS = 5000;

/** @param {string} url */
const fetchLocal = (url) => fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/** Where a variant's tile is drawn: the export PNG, the rectangle in its pixels
 *  and the scale it was exported at — read from the tile maps, which the export
 *  writes and nothing edits (designs/STANDARD.md, "Exports and sidecars").
 *  @param {string} key @returns {{ stem: string, png: string, rect: number[], scale: number }} */
function locateTile(key) {
  for (const file of readdirSync(EXPORTS).filter((name) =>
    name.endsWith('.tiles.json'),
  )) {
    const map = JSON.parse(readFileSync(join(EXPORTS, file), 'utf8'));
    const rect = map.tiles?.[key];
    if (rect) {
      const stem = file.replace(/\.tiles\.json$/, '');
      return { stem, png: join(EXPORTS, `${stem}.png`), rect, scale: map.scale };
    }
  }
  throw new Error(`${key} has no tile on any board export — see the boards check`);
}

/** The screenshot's bytes and where they came from: a file named with `--png`,
 *  the console that served the shot URL, or the committed baseline.
 *  @param {ReturnType<typeof parseArgs>} args @returns {Promise<{ from: string, image: Image }>} */
async function readShot({ target, png }) {
  if (png) return { from: png, image: PNG.sync.read(readFileSync(png)) };

  if (target.origin) {
    const url = `${target.origin}/api/sets/${encodeURIComponent(target.label)}/shots/${target.key}.png`;
    const response = await fetchLocal(url).catch(() => null);
    if (!response?.ok) {
      throw new Error(
        `${url} answered ${response?.status ?? 'nothing'} — is the console up?`,
      );
    }
    return { from: url, image: PNG.sync.read(Buffer.from(await response.arrayBuffer())) };
  }

  const path = join(BASELINES, `${target.key}.png`);
  if (!existsSync(path)) throw new Error(`no screenshot at ${path}`);
  return { from: path, image: PNG.sync.read(readFileSync(path)) };
}

/** The story's source file, from the running Storybook's index. Absent when
 *  Storybook is not up: the measurement does not need it, the fix does.
 *  @param {string} storybook @param {string} storyId @returns {Promise<string | null>} */
async function storySource(storybook, storyId) {
  try {
    const response = await fetchLocal(`${storybook}/index.json`);
    if (!response.ok) return null;
    const entry = (await response.json()).entries?.[storyId];
    // An importPath is relative to apps/storybook; join resolves its `..`.
    return entry ? join('apps/storybook', entry.importPath) : null;
  } catch {
    return null;
  }
}

/** The Storybook globals that render a variant: the theme always, the locale for
 *  a story listed for it. The viewport is the manager's, never the iframe's.
 *  @param {Variant} variant */
function globalsOf(variant) {
  const globals = [`${COLOR_SCHEME_GLOBAL}:${variant.theme}`];
  if (variant.locale) globals.push(`${LOCALE_GLOBAL}:${variant.locale}`);
  return globals.join(';');
}

/** Every address the session reads, looks at or writes, printed before the rows
 *  so they are read off one place instead of rebuilt by hand.
 *  @param {ReturnType<typeof parseArgs>} args @param {Variant} variant
 *  @param {ReturnType<typeof locateTile>} tile @param {string} shotFrom */
async function printAddresses({ target, storybook }, variant, tile, shotFrom) {
  const shotView = target.origin
    ? `${target.origin}/set/${target.label}/shot/${target.key}`
    : null;
  const globals = globalsOf(variant);
  const lines = [
    ['variant', target.key],
    [
      'tier',
      `${variant.tier} · ${variant.viewport} · ${variant.theme}${variant.locale ? ` · ${variant.locale}` : ''}`,
    ],
    ['set', target.label],
    ['shot view', shotView ?? '— (no console URL given)'],
    ['overlay', shotView ? `${shotView}?view=overlay&blend=difference` : '—'],
    [
      'story',
      `${storybook}/?path=/story/${variant.storyId}&globals=${globals};viewport.value:${variant.viewport}`,
    ],
    ['captured', `${storybook}/iframe.html?id=${variant.storyId}&globals=${globals}`],
    [
      'source',
      (await storySource(storybook, variant.storyId)) ?? '— (Storybook not reachable)',
    ],
    ['screenshot', shotFrom.replace(`${REPO_ROOT}/`, '')],
    ['baseline', `packages/visual-diff/__baselines__/${target.key}.png`],
    ['board', `designs/${tile.stem}.pen — frame "${target.key}"`],
    [
      'export',
      `designs/exports/${tile.stem}.png @${tile.scale}, rect [${tile.rect.join(', ')}]`,
    ],
  ];
  process.stdout.write('addresses\n');
  for (const [name, value] of lines)
    process.stdout.write(`  ${name.padEnd(11)} ${value}\n`);
}

/** The tile's crop, box-averaged from the export's scale down to design pixels.
 *  @param {Image} board @param {number[]} rect @param {number} scale @returns {Image} */
function cropToDesignPixels(board, [x0, y0, w, h], scale) {
  const width = Math.round(w / scale);
  const height = Math.round(h / scale);
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = averageCell(board, x0 + x * scale, y0 + y * scale, scale);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** One design pixel's colour: the mean of the export pixels it covers.
 *  @param {Image} board @param {number} left @param {number} top @param {number} scale
 *  @returns {[number, number, number]} */
function averageCell(board, left, top, scale) {
  const sum = [0, 0, 0];
  let count = 0;
  const sx0 = Math.floor(left);
  const sx1 = Math.max(sx0 + 1, Math.floor(left + scale));
  const sy0 = Math.floor(top);
  const sy1 = Math.max(sy0 + 1, Math.floor(top + scale));
  for (let sy = sy0; sy < sy1; sy += 1) {
    for (let sx = sx0; sx < sx1; sx += 1) {
      const i = (sy * board.width + sx) * 4;
      sum[0] += board.data[i];
      sum[1] += board.data[i + 1];
      sum[2] += board.data[i + 2];
      count += 1;
    }
  }
  return [
    Math.round(sum[0] / count),
    Math.round(sum[1] / count),
    Math.round(sum[2] / count),
  ];
}

/** @param {Image} image @param {number} x @param {number} y @returns {[number, number, number]} */
function rgb(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

/** The ground, sampled two pixels in from the corner, past the border the shot
 *  draws and the corner radius the tile rounds. @param {Image} image */
function groundOf(image) {
  const [r, g, b] = rgb(image, 2, 2);
  return r + g + b;
}

/** @param {Image} image @param {number} x @param {number} y @param {number} groundSum */
function isInk(image, x, y, groundSum) {
  const [r, g, b] = rgb(image, x, y);
  return Math.abs(r + g + b - groundSum) > INK_DISTANCE;
}

/** One row's reading.
 *  @param {Image} image @param {number} y @param {number} groundSum
 *  @returns {'ink' | 'tint' | 'plain'} */
function classifyRow(image, y, groundSum) {
  let tinted = 0;
  for (let x = 0; x < image.width; x += 1) {
    if (isInk(image, x, y, groundSum)) return 'ink';
    const [r, g, b] = rgb(image, x, y);
    if (Math.abs(r - g) + Math.abs(g - b) > CHROMA) tinted += 1;
  }
  return tinted > image.width * TINT_SHARE ? 'tint' : 'plain';
}

/** @typedef {{ kind: 'ink' | 'tint' | 'plain', from: number, to: number }} Run */

/** @param {Image} image @returns {Run[]} */
function rowRuns(image) {
  const groundSum = groundOf(image);
  /** @type {Run[]} */
  const runs = [];
  for (let y = 0; y < image.height; y += 1) {
    const kind = classifyRow(image, y, groundSum);
    const last = runs.at(-1);
    if (last && last.kind === kind) last.to = y;
    else runs.push({ kind, from: y, to: y });
  }
  return runs;
}

/** @param {Image} image @param {Run} run @param {number} x @param {number} groundSum */
function columnHasInk(image, run, x, groundSum) {
  for (let y = run.from; y <= run.to; y += 1) {
    if (isInk(image, x, y, groundSum)) return true;
  }
  return false;
}

/** The columns an ink run spans: its first and last inked column, so a width
 *  (a weight, a tracking, a face) reads beside its rows.
 *  @param {Image} image @param {Run} run @returns {[number, number] | null} */
function inkColumns(image, run) {
  const groundSum = groundOf(image);
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x += 1) {
    if (!columnHasInk(image, run, x, groundSum)) continue;
    if (first < 0) first = x;
    last = x;
  }
  return first < 0 ? null : [first, last];
}

/** @param {Run} run @returns {string} */
const formatRun = (run) =>
  `${run.kind.padEnd(5)} ${String(run.from).padStart(4)}–${String(run.to).padEnd(4)} (${run.to - run.from + 1})`;

/** @param {string} label @param {Image} image */
function printImage(label, image) {
  process.stdout.write(`\n${label} — ${image.width}×${image.height}\n`);
  for (const run of rowRuns(image)) {
    const cols = run.kind === 'ink' ? inkColumns(image, run) : null;
    const span = cols ? `  cols ${cols[0]}–${cols[1]} (${cols[1] - cols[0] + 1})` : '';
    process.stdout.write(`  ${formatRun(run)}${span}\n`);
  }
}

/** The ink runs of both images, paired in order, with the shot's offset from
 *  the tile. The pairing holds while both carry the same lines of text; once
 *  the counts differ, the list where they diverge is the finding.
 *  @param {Image} tile @param {Image} shot */
function printInkPairs(tile, shot) {
  const a = rowRuns(tile).filter((run) => run.kind === 'ink');
  const b = rowRuns(shot).filter((run) => run.kind === 'ink');
  process.stdout.write(`\nink rows, tile → shot (${a.length} vs ${b.length} runs)\n`);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const t = a[i] ? `${a[i].from}–${a[i].to}` : '—';
    const s = b[i] ? `${b[i].from}–${b[i].to}` : '—';
    const offset = a[i] && b[i] ? b[i].from - a[i].from : null;
    const delta = offset === null ? '' : `${offset > 0 ? '+' : ''}${offset}`;
    process.stdout.write(
      `  ${String(i + 1).padStart(2)}  ${t.padEnd(10)} ${s.padEnd(10)} ${delta}\n`,
    );
  }
}

async function main() {
  const [first, ...rest] = process.argv.slice(2);
  if (!first) usageError('no shot URL or variant key');
  const args = parseArgs(first, rest);
  const variant = parseKey(args.target.key);
  const tile = locateTile(args.target.key);
  const shot = await readShot(args);
  const tileImage = cropToDesignPixels(
    PNG.sync.read(readFileSync(tile.png)),
    tile.rect,
    tile.scale,
  );

  await printAddresses(args, variant, tile, shot.from);
  printImage(`tile  designs/exports/${tile.stem}.png @${tile.scale}`, tileImage);
  printImage(`shot  ${shot.from.replace(`${REPO_ROOT}/`, '')}`, shot.image);
  printInkPairs(tileImage, shot.image);
}

await main();

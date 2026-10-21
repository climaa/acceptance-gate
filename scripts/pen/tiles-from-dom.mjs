// Draws a board's tiles from the rendered stories: one SVG per light tile, ready to
// paste into the board's .pen file, and the Pencil snippet that names their colours.
//
//   node scripts/pen/tiles-from-dom.mjs --static <storybook-static> --out <dir>
//     [--tier <tier>] [--filter <text>] [--baselines <dir>] [--preview] [--max-diff <pct>]
//   node scripts/pen/tiles-from-dom.mjs --verify <exported pngs> --baselines <dir> --out <dir>
//
// For a tier whose tiles are whole pages — templates here, screens in a child — a
// hand-drawn tile goes stale the moment the page changes. This renders each planned
// variant the way the differ captures it (same index, viewports, theme global, frozen
// clock and animations), in light and in dark, walks what the page paints
// (tiles-from-dom/extract-page.mjs) and writes `<variant key>.svg` per light tile plus
// `place.js`, scripts/pen/place-tiles.js with the run's palette in front.
//
// Then, per board file: open it with `open -a Pen`, paste its tiles' SVGs
// (scripts/pen/paste-tiles.mjs on macOS), run `place.js` through the Pencil MCP, and
// `--verify` the PNGs it exported against the baselines. designs/STANDARD.md has the
// rule this serves: a tile is drawn 1:1 with its screenshot.
//
// `--preview` renders each SVG with its light colours and pixel-compares it with the
// baseline, so the conversion is checked without Pen; it exits 1 when a tile differs
// by more than --max-diff percent (default 3), which is what CI runs.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  buildInitScript,
  FREEZE_CSS,
  PINNED_TIMEZONE,
  RENDER_PHASE_EXPRESSION,
} from '../../packages/visual-diff/src/determinism.mjs';
import { isLoopbackUrl, launchBrowser } from '../../packages/visual-diff/src/capture.mjs';
import {
  CAPTURE_TARGET,
  COLOR_SCHEME_GLOBAL,
  DETERMINISM,
  VIEWPORTS,
} from '../../packages/visual-diff/src/policy.mjs';
import { createStaticServer } from '../../packages/visual-diff/src/static-server.mjs';
import {
  planCaptures,
  readIndex,
} from '../../packages/visual-diff/src/storybook-index.mjs';
import { extractPage } from './tiles-from-dom/extract-page.mjs';
import {
  createTables,
  lightPreview,
  pairThemes,
  renderTile,
} from './tiles-from-dom/svg.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const require = createRequire(join(ROOT, 'packages/visual-diff/package.json'));
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default ?? require('pixelmatch');

const { values: args } = parseArgs({
  options: {
    static: { type: 'string' },
    out: { type: 'string' },
    tier: { type: 'string' },
    filter: { type: 'string', default: '' },
    baselines: {
      type: 'string',
      default: join(ROOT, 'packages/visual-diff/__baselines__'),
    },
    preview: { type: 'boolean', default: false },
    verify: { type: 'string' },
    'max-diff': { type: 'string', default: '3' },
  },
});

/** Percent of pixels pixelmatch calls different, or null when the sizes differ.
 *  @param {Buffer} a @param {Buffer} b */
function diffPercent(a, b) {
  const x = PNG.sync.read(a);
  const y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) return null;
  const n = pixelmatch(x.data, y.data, null, x.width, x.height, { threshold: 0.2 });
  return (100 * n) / (x.width * x.height);
}

/** @param {Buffer} png */
const sizeOf = (png) => `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;

/** A tile is drawn at its baseline's size (designs/STANDARD.md), which the page's own
 *  box only approximates: the screenshot rounds a fractional edge outward.
 *  @param {string} key @param {[number, number]} measured @returns {[number, number]} */
function tileSize(key, measured) {
  const file = join(/** @type {string} */ (args.baselines), `${key}.png`);
  if (!existsSync(file)) return [Math.ceil(measured[0]), Math.ceil(measured[1])];
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

/** @param {import('playwright').Page} page @param {string} url @param {boolean} fullPage */
async function render(page, url, fullPage) {
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: FREEZE_CSS });
  await page.waitForFunction(RENDER_PHASE_EXPRESSION).catch(() => undefined);
  // Every registered face, not only those already asked for: a face the first layout
  // has not used yet would land after the walk and move every line below it.
  await page.evaluate(() => Promise.all([...document.fonts].map((face) => face.load())));
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(extractPage, { fullPage, target: CAPTURE_TARGET });
}

async function draw() {
  const out = resolve(/** @type {string} */ (args.out));
  mkdirSync(out, { recursive: true });
  const index = readIndex(readFileSync(join(args.static ?? '', 'index.json'), 'utf8'));
  const variants = planCaptures(index).variants.filter(
    (v) =>
      v.theme === 'light' &&
      (!args.tier || v.tier === args.tier) &&
      v.key.includes(args.filter ?? ''),
  );
  const server = await createStaticServer(/** @type {string} */ (args.static)).listen();
  const browser = await launchBrowser();
  const tables = createTables();
  const written = [];
  try {
    for (const [viewport, size] of Object.entries(VIEWPORTS)) {
      // The capture's own context (packages/visual-diff/src/capture.mjs), so the page
      // laid out here is the page its baseline photographed.
      const context = await browser.newContext({
        viewport: size,
        reducedMotion: 'reduce',
        deviceScaleFactor: DETERMINISM.deviceScaleFactor,
        timezoneId: PINNED_TIMEZONE,
      });
      await context.addInitScript(buildInitScript());
      await context.route('**/*', (route) =>
        isLoopbackUrl(route.request().url()) ? route.continue() : route.abort(),
      );
      const page = await context.newPage();
      for (const v of variants.filter((x) => x.viewport === viewport)) {
        const url = (theme) =>
          `http://127.0.0.1:${server.port}/iframe.html?id=${encodeURIComponent(v.id)}&globals=${COLOR_SCHEME_GLOBAL}:${theme}`;
        const light = await render(page, url('light'), v.fullPage);
        const dark = await render(page, url('dark'), v.fullPage);
        const { svg, undrawn } = renderTile({
          key: v.key,
          size: tileSize(v.key, light.size),
          pairs: pairThemes(light.ops, dark.ops),
          tables,
        });
        writeFileSync(join(out, `${v.key}.svg`), svg);
        written.push(v.key);
        console.log(
          `${v.key}  ${light.ops.length} operations${undrawn.length ? `  NOT DRAWN: ${undrawn.join(', ')}` : ''}`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const template = readFileSync(join(ROOT, 'scripts/pen/place-tiles.js'), 'utf8');
  const data = { palette: tables.palette, styles: tables.styles };
  writeFileSync(
    join(out, 'place.js'),
    `const DATA = ${JSON.stringify(data)};\nconst OUT = ${JSON.stringify(join(out, 'pen'))};\n${template}`,
  );
  writeFileSync(join(out, 'palette.json'), JSON.stringify(data, null, 2));
  console.log(`${written.length} tiles, ${tables.palette.length} colour pairs → ${out}`);
  return { out, written, palette: tables.palette };
}

/** Each SVG in its light colours, screenshotted in a Storybook page (so the fonts are
 *  the app's) and compared with its baseline. @param {Awaited<ReturnType<typeof draw>>} run */
async function preview({ out, written, palette }) {
  const server = await createStaticServer(/** @type {string} */ (args.static)).listen();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const max = Number(args['max-diff']);
  let worst = 0;
  try {
    const firstStory = written[0]?.split('__')[3] ?? '';
    await page.goto(
      `http://127.0.0.1:${server.port}/iframe.html?id=${encodeURIComponent(firstStory)}&globals=${COLOR_SCHEME_GLOBAL}:light`,
    );
    await page.evaluate(() => document.fonts.ready);
    for (const key of written) {
      const svg = lightPreview(readFileSync(join(out, `${key}.svg`), 'utf8'), palette);
      const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/) ?? [];
      await page.setViewportSize({
        width: Number(w),
        height: Math.min(Number(h), 16000),
      });
      await page.evaluate((s) => {
        document.documentElement.style.cssText = 'visibility:visible;overflow:hidden';
        document.body.className = '';
        document.body.style.cssText =
          'margin:0;padding:0;display:block;visibility:visible';
        document.body.innerHTML = s;
      }, svg);
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({
        clip: { x: 0, y: 0, width: Number(w), height: Number(h) },
      });
      writeFileSync(join(out, `${key}.preview.png`), shot);
      const base = readFileSync(
        join(/** @type {string} */ (args.baselines), `${key}.png`),
      );
      const pct = diffPercent(shot, base);
      worst = Math.max(worst, pct ?? Infinity);
      console.log(
        `${pct === null ? `SIZE ${sizeOf(shot)} vs baseline ${sizeOf(base)}` : `${pct.toFixed(2)}%`}  ${key}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log(`worst tile ${worst.toFixed(2)}% (limit ${max}%)`);
  if (worst > max) process.exitCode = 1;
}

/** Pen's exports are named by node id: each is matched to the baseline of its size it
 *  differs from least, which names the tile and its theme in one step. */
function verify() {
  const dir = /** @type {string} */ (args.verify);
  const keys = readdirSync(/** @type {string} */ (args.out))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .flatMap((k) => [k, k.replace('__light__', '__dark__')]);
  const bases = keys.map((k) => ({
    k,
    png: readFileSync(join(/** @type {string} */ (args.baselines), `${k}.png`)),
  }));
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.png'))) {
    const shot = readFileSync(join(dir, f));
    const best = bases
      .map((b) => ({ k: b.k, pct: diffPercent(shot, b.png) }))
      .filter((b) => b.pct !== null)
      .sort((a, b) => /** @type {number} */ (a.pct) - /** @type {number} */ (b.pct))[0];
    console.log(
      best
        ? `${/** @type {number} */ (best.pct).toFixed(2)}%  ${best.k}  (${f})`
        : `NO BASELINE OF THIS SIZE  ${f}`,
    );
  }
}

if (args.verify) verify();
else {
  if (!args.static || !args.out) {
    console.error(
      'usage: node scripts/pen/tiles-from-dom.mjs --static <storybook-static> --out <dir> [--tier t] [--preview]',
    );
    process.exit(2);
  }
  const run = await draw();
  if (args.preview) await preview(run);
}

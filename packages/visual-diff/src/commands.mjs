// @ts-check
//
// The command layer: `check` and `accept`, wiring the five modules under it into one
// flow. Every impure edge — the filesystem, the static server, the browser, the host
// probe — arrives as an injected dependency, so the whole flow is exercised in the suite
// with no browser, no socket and no real baseline on disk.
//
// The exit code is the product. Three of them, from `policy.EXIT`: the UI is unchanged,
// a human must look, or the gate itself is broken. Everything below is in service of
// never returning the wrong one — in particular, never returning 0 for a run that proved
// nothing.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { buildSummary, renderSummaryMd } from './artifacts.mjs';
import {
  captureAll,
  filterNeedles,
  launchBrowser,
  matchesFilter,
  themeSanity,
  viewportSanity,
} from './capture.mjs';
import { compareAll } from './compare.mjs';
import { EXIT, HOST, PATHS, SKIP_TAG, assertWithinBudget } from './policy.mjs';
import { renderReport } from './report-html.mjs';
import { LOOPBACK_HOST, createStaticServer } from './static-server.mjs';
import { planCaptures, readIndex } from './storybook-index.mjs';

/** @typedef {import('./artifacts.mjs').Summary} Summary */
/** @typedef {import('./capture.mjs').CaptureResult} CaptureResult */
/** @typedef {import('./compare.mjs').Comparison} Comparison */
/** @typedef {import('./report-html.mjs').VariantImages} VariantImages */
/** @typedef {import('./storybook-index.mjs').PlannedVariant} PlannedVariant */

/** The permission to compare against baselines captured on another host. Read exactly
 *  `'1'`, never truthiness — the variable flows through turbo into CI, where
 *  `VISUAL_DIFF_ALLOW_HOST_MISMATCH=false` is a string that would otherwise wave the
 *  guard through. Same rule, and the same reason, as `compare.mjs`'s `STRICT_ENV`. */
export const ALLOW_HOST_MISMATCH_ENV = 'VISUAL_DIFF_ALLOW_HOST_MISMATCH';

const PNG_SUFFIX = '.png';

/** Every `PATHS` entry is repo-root-relative, so the CLI means the same directory
 *  whichever workspace it was invoked from — including from inside the container, whose
 *  working directory is not the caller's. */
const REPO_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

/** A `PATHS` entry resolved against the repo root the command was pointed at.
 *  @param {string} rootDir @returns {(relative: string) => string} */
const under = (rootDir) => (relative) => path.join(rootDir, relative);

/** @typedef {(file: string, encoding: 'utf8') => Promise<string>} ReadText */
/** @typedef {(file: string) => Promise<Uint8Array>} ReadBytes */

/** The filesystem surface the two commands use, and nothing beyond it.
 *  @typedef {{ readFile: ReadText & ReadBytes,
 *              writeFile: (file: string, data: string | Uint8Array) => Promise<void>,
 *              mkdir: (dir: string, options: { recursive: true }) => Promise<unknown>,
 *              readdir: (dir: string) => Promise<string[]>,
 *              rm: (file: string) => Promise<void> }} GateFs */

/** What one capture run produced: the shots, and the browser build that took them —
 *  which `accept` stamps into `BASELINE_ENV.json` and no later reader can recover.
 *  @typedef {{ captures: CaptureResult[], chromium: string }} CaptureRun */

/** @typedef {{ fs: GateFs,
 *              readIndex: typeof readIndex,
 *              planCaptures: typeof planCaptures,
 *              serve: (rootDir: string) => Promise<{ baseUrl: string,
 *                                                    close: () => Promise<void> }>,
 *              capture: (run: { variants: PlannedVariant[], baseUrl: string })
 *                => Promise<CaptureRun>,
 *              compare: typeof compareAll,
 *              writeArtifacts: typeof writeArtifacts,
 *              host: () => Promise<Record<string, string>>,
 *              env: Record<string, string | undefined> }} Deps */

/** @typedef {{ rootDir?: string, filter?: string | readonly string[],
 *              allowHostMismatch?: boolean }} Options */

/** @typedef {{ exitCode: number, message: string, summary?: Summary,
 *              written?: string[], pruned?: string[] }} CommandResult */

const require = createRequire(import.meta.url);

/** @param {string} rootDir @returns {Promise<{ baseUrl: string, close: () => Promise<void> }>} */
async function serve(rootDir) {
  const { port, close } = await createStaticServer(rootDir).listen();

  return { baseUrl: `http://${LOOPBACK_HOST}:${port}`, close };
}

/** One browser for the whole run, closed however the run ends.
 *  @param {{ variants: PlannedVariant[], baseUrl: string }} run
 *  @returns {Promise<CaptureRun>} */
async function capture({ variants, baseUrl }) {
  const browser = await launchBrowser();

  try {
    return {
      captures: await captureAll({ variants, baseUrl, browser }),
      chromium: browser.version(),
    };
  } finally {
    await browser.close();
  }
}

/** This machine, in the shape `BASELINE_ENV.json` records. The Playwright version is
 *  read off the installed package rather than restated: the whole point of the stamp is
 *  that it describes what actually ran.
 *  @returns {Promise<Record<string, string>>} */
export async function probeHost() {
  return {
    platform: process.platform,
    arch: process.arch,
    image: HOST.image,
    playwright: require('playwright/package.json').version,
  };
}

/** The real modules behind every injected edge. Built fresh per call so a test that
 *  overrides one member cannot leak into the next.
 *  @returns {Deps} */
export function defaultDeps() {
  return {
    fs: /** @type {GateFs} */ ({ readFile, writeFile, mkdir, readdir, rm }),
    readIndex,
    planCaptures,
    serve,
    capture,
    compare: compareAll,
    writeArtifacts,
    host: probeHost,
    env: process.env,
  };
}

/** @param {unknown} cause */
const messageOf = (cause) => (cause instanceof Error ? cause.message : String(cause));

/** @param {string} message @returns {CommandResult} */
const broken = (message) => ({ exitCode: EXIT.broken, message });

/** The variants one run captures. Every failure here is `EXIT.broken`, never a quietly
 *  smaller run: a differ that captures fewer stories than the build contains reports
 *  green over an unexamined UI.
 *  @param {Deps} deps @param {(relative: string) => string} at
 *  @param {string | readonly string[]} [filter]
 *  @returns {Promise<{ variants: PlannedVariant[], skipped: string[] }>} */
async function readPlan(deps, at, filter) {
  const indexPath = at(`${PATHS.storybookStatic}/index.json`);

  let text;
  try {
    text = await deps.fs.readFile(indexPath, 'utf8');
  } catch {
    throw new Error(
      `no Storybook build at ${PATHS.storybookStatic} — run \`pnpm --filter @gate/storybook build\` first`,
    );
  }

  const entries = deps.readIndex(text).filter((entry) => matchesFilter(filter, entry));
  if (entries.length === 0) {
    throw new Error(
      `--filter ${filterNeedles(filter).join(', ')} matched no story in ${PATHS.storybookStatic}`,
    );
  }

  const { variants, skipped } = deps.planCaptures(entries);
  if (variants.length === 0) {
    throw new Error(
      `every story this run covers carries ${SKIP_TAG} (${skipped.join(', ')}) — there is nothing to capture`,
    );
  }

  return { variants, skipped };
}

/** Serve the build, capture against it, and close the server however the capture ended —
 *  a leaked server holds the process open long after the last shot.
 *  @param {Deps} deps @param {(relative: string) => string} at
 *  @param {PlannedVariant[]} variants @returns {Promise<CaptureRun>} */
async function runCapture(deps, at, variants) {
  const server = await deps.serve(at(PATHS.storybookStatic));

  try {
    return await deps.capture({ variants, baseUrl: server.baseUrl });
  } finally {
    await server.close();
  }
}

/** Both gates, over the shots that are actually shots: an errored variant carries
 *  whatever the page looked like when it failed, and judging the theme axis by those
 *  would fire the gate on a story bug.
 *  @param {readonly CaptureResult[]} captures @throws {import('./capture.mjs').SanityError} */
function assertSane(captures) {
  const shots = captures.filter((result) => result.bucket !== 'errored');

  themeSanity(shots);
  viewportSanity(shots);
}

/** One committed baseline, as the `[key, bytes]` pair its map is built from: the key is
 *  the filename minus `.png`, which is `policy.variantKey` by construction.
 *  @param {GateFs} fs @param {string} dir @param {string} name
 *  @returns {Promise<[string, Uint8Array]>} */
const readBaseline = async (fs, dir, name) => [
  name.slice(0, -PNG_SUFFIX.length),
  await fs.readFile(path.join(dir, name)),
];

/** The committed baselines, keyed by `policy.variantKey` — the same name the capture
 *  plan carries. An absent directory is an empty map, not an error: the first run of a
 *  new corpus has no baselines and reports every variant as `added`.
 *  @param {GateFs} fs @param {string} dir @returns {Promise<Map<string, Uint8Array>>} */
async function readBaselines(fs, dir) {
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return new Map();
  }

  const entries = await Promise.all(
    names
      .filter((name) => name.endsWith(PNG_SUFFIX))
      .map((name) => readBaseline(fs, dir, name)),
  );

  return new Map(entries);
}

/** @param {GateFs} fs @param {string} file @returns {Promise<Record<string, string> | null>} */
async function readJson(fs, file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The recorded fields that disagree with this host. An unrecorded field counts as a
 *  mismatch: a stamp that does not say which platform it was captured on cannot prove
 *  the baselines are comparable, and reading its silence as agreement is how a guard
 *  becomes decorative.
 *  @param {Readonly<Record<string, string | undefined>>} recorded
 *  @param {Readonly<Record<string, string>>} actual
 *  @returns {string[]} */
export function mismatchedHostKeys(recorded, actual) {
  return HOST.comparedKeys.filter((key) => recorded[key] !== actual[key]);
}

/** @param {Record<string, string | undefined>} env @param {boolean} flag */
const allowsHostMismatch = (env, flag) => flag || env[ALLOW_HOST_MISMATCH_ENV] === '1';

/** @typedef {{ blocked: boolean, message: string, warnings: string[] }} HostGuard */

/** A run the guard lets through, carrying whatever it still wants the report to say.
 *  @param {string[]} [warnings] @returns {HostGuard} */
const comparable = (warnings = []) => ({ blocked: false, message: '', warnings });

/** @param {Readonly<Record<string, string | undefined>>} recorded
 *  @param {Readonly<Record<string, string>>} actual @param {readonly string[]} keys */
const describeMismatch = (recorded, actual, keys) =>
  keys
    .map(
      (key) =>
        `${key}: baselines ${recorded[key] ?? '(unrecorded)'}, here ${actual[key]}`,
    )
    .join('; ');

/** Baselines are only comparable to shots from the host that took them, so a mismatch
 *  is a broken gate rather than a diff to review.
 *
 *  `--allow-host-mismatch` downgrades *the mismatch* to an advisory warning and nothing
 *  else: the diff verdict stays authoritative, so a run under the flag still exits 1 on
 *  a change. An unconditional 0 here would silently turn the gate off for every CI run
 *  carrying the environment variable.
 *  @param {Deps} deps @param {(relative: string) => string} at
 *  @param {{ allowHostMismatch: boolean, hasBaselines: boolean }} run
 *  @returns {Promise<HostGuard>} */
async function guardHost(deps, at, { allowHostMismatch, hasBaselines }) {
  const recorded = await readJson(deps.fs, at(PATHS.baselineEnv));
  if (!recorded) {
    // A first run has no baselines to be incomparable to, so the missing stamp is only
    // worth saying once there is something committed it should have described.
    if (!hasBaselines) return comparable();

    return comparable([
      `${PATHS.baselineEnv} is missing — the committed baselines name no host, so nothing proves this run is comparable to them`,
    ]);
  }

  const actual = await deps.host();
  const mismatched = mismatchedHostKeys(recorded, actual);
  if (mismatched.length === 0) return comparable();

  const detail = describeMismatch(recorded, actual, mismatched);
  if (!allowsHostMismatch(deps.env, allowHostMismatch)) {
    return {
      blocked: true,
      message: `this host is not the one the baselines were captured on (${detail}) — capture inside ${HOST.image}, or pass --allow-host-mismatch to compare anyway`,
      warnings: [],
    };
  }

  return comparable([
    `host mismatch allowed (${detail}) — a pixel difference in this run may be this machine's rather than the UI's`,
  ]);
}

/** The baselines a run is answerable for. A filtered run captures part of the corpus by
 *  design, so every baseline outside it would come back `removed` — a narrowed run
 *  failing over the stories it deliberately did not shoot.
 *  @param {ReadonlyMap<string, Uint8Array>} baselines
 *  @param {readonly PlannedVariant[]} covered
 *  @returns {Map<string, Uint8Array>} */
function coveredBaselines(baselines, covered) {
  const keys = new Set(covered.map((variant) => variant.key));

  return new Map([...baselines].filter(([key]) => keys.has(key)));
}

/** A skipped story is reported, never hidden: `policy.SKIP_TAG` promises the report
 *  lists them, and a hole in the corpus that nothing mentions reads as coverage.
 *  @param {readonly string[]} skipped @returns {string[]} */
const skipWarnings = (skipped) =>
  skipped.length === 0
    ? []
    : [`${skipped.length} story(ies) skipped by ${SKIP_TAG}: ${skipped.join(', ')}`];

/** The three PNGs a report card can show, per failing variant. `unchanged` rows never
 *  reach `summary.variants`, so nothing here inlines a shot nobody will look at.
 *  @param {Summary} summary @param {readonly Comparison[]} results
 *  @param {readonly CaptureResult[]} captures
 *  @param {ReadonlyMap<string, Uint8Array>} baselines
 *  @returns {Map<string, VariantImages>} */
function collectImages(summary, results, captures, baselines) {
  const candidates = new Map(captures.map((result) => [result.key, result.bytes]));
  const diffs = new Map(results.map((row) => [row.key, row.diff]));

  return new Map(
    summary.variants.map((variant) => [
      variant.key,
      {
        baseline: baselines.get(variant.key),
        candidate: candidates.get(variant.key) ?? undefined,
        diff: diffs.get(variant.key) ?? undefined,
      },
    ]),
  );
}

/** The run's output: the comment, the review page, one diff PNG per failing variant,
 *  and — last — the record. Every path comes from `policy.PATHS`.
 *
 *  `summary.json` is written last, not first, because it is the only artifact that
 *  describes the others: `stamp` is called immediately before it is serialised, which
 *  is what lets its `timing` cover rendering the page and writing the PNGs. Written
 *  first, as it once was, the run's own most expensive artifact-producing phase fell
 *  outside every number in it.
 *  @param {GateFs} fs
 *  @param {{ rootDir: string, summary: Summary,
 *            images: ReadonlyMap<string, VariantImages>,
 *            stamp?: () => void }} run
 *  @returns {Promise<void>} */
async function writeArtifacts(fs, { rootDir, summary, images, stamp }) {
  const at = under(rootDir);
  await fs.mkdir(at(PATHS.diffs), { recursive: true });

  await fs.writeFile(at(PATHS.summaryMd), `${renderSummaryMd(summary)}\n`);
  await fs.writeFile(at(PATHS.reportHtml), renderReport(summary, images));

  for (const [key, { diff }] of images) {
    if (diff) await fs.writeFile(path.join(at(PATHS.diffs), `${key}${PNG_SUFFIX}`), diff);
  }

  stamp?.();
  await fs.writeFile(at(PATHS.summaryJson), `${JSON.stringify(summary, null, 2)}\n`);
}

/**
 * A monotonic reading in milliseconds.
 *
 * `performance.now()` rather than `Date.now()`, because the number that matters is an
 * elapsed one and a wall clock can step sideways mid-run. This is node's clock and not
 * the page's — `determinism.mjs` pins `performance.now` inside the BROWSER so a story
 * cannot render a timestamp, and that init script never runs here.
 *
 * @returns {number} */
const now = () => performance.now();

/** @param {Summary} summary @returns {string} */
const verdictOf = (summary) =>
  summary.exitCode === EXIT.ok
    ? `no visual change across ${summary.counts.unchanged} variant(s)`
    : `${summary.variants.length} variant(s) need review — open ${PATHS.reportHtml}`;

/** Capture the corpus and compare it against the committed baselines.
 *  @param {Deps} [deps] @param {Options} [opts] @returns {Promise<CommandResult>} */
export async function check(deps = defaultDeps(), opts = {}) {
  const { rootDir = REPO_ROOT, filter, allowHostMismatch = false } = opts;
  const at = under(rootDir);

  try {
    const { variants, skipped } = await readPlan(deps, at, filter);
    const committed = await readBaselines(deps.fs, at(PATHS.baselines));
    const baselines =
      filterNeedles(filter).length > 0
        ? coveredBaselines(committed, variants)
        : committed;

    const guard = await guardHost(deps, at, {
      allowHostMismatch,
      hasBaselines: baselines.size > 0,
    });
    if (guard.blocked) return broken(guard.message);

    const startedAt = now();
    const { captures, chromium } = await runCapture(deps, at, variants);
    const capturedAt = now();
    assertSane(captures);

    const results = deps.compare({ captures, baselines, env: deps.env });
    const comparedAt = now();

    const summary = buildSummary(results, { ...(await deps.host()), chromium });
    summary.warnings.push(...guard.warnings, ...skipWarnings(skipped));

    await deps.writeArtifacts(deps.fs, {
      rootDir,
      summary,
      images: collectImages(summary, results, captures, baselines),
      // Stamped by the writer, immediately before the record is serialised, so the
      // numbers in it describe the run that produced it rather than the run up to
      // the point it happened to be written. `reportMs` runs from the compare mark
      // because building the summary and collecting the images are report work too.
      stamp: () => {
        const reportedAt = now();
        summary.timing = {
          captureMs: Math.round(capturedAt - startedAt),
          compareMs: Math.round(comparedAt - capturedAt),
          reportMs: Math.round(reportedAt - comparedAt),
          totalMs: Math.round(reportedAt - startedAt),
        };
      },
    });

    return { exitCode: summary.exitCode, message: verdictOf(summary), summary };
  } catch (cause) {
    return broken(messageOf(cause));
  }
}

/** The shots this run is allowed to commit, keyed by variant.
 *
 *  A variant that failed to capture takes the whole accept down rather than being
 *  skipped: the alternative is a baseline set that is silently one story short, and the
 *  next `check` reports that story as `removed` with nothing to say why.
 *  @param {readonly CaptureResult[]} captures @returns {Map<string, Uint8Array>} */
function acceptableShots(captures) {
  const failed = captures.filter(
    (result) => result.bucket === 'errored' || !result.bytes,
  );
  if (failed.length > 0) {
    const names = failed.map((result) => result.key).join(', ');
    throw new Error(
      `${failed.length} variant(s) did not capture cleanly (${names}) — nothing was written`,
    );
  }

  return new Map(
    captures.map((result) => [result.key, /** @type {Uint8Array} */ (result.bytes)]),
  );
}

/** @param {Iterable<Uint8Array | undefined>} shots @returns {number} */
const sumBytes = (shots) =>
  [...shots].reduce((total, shot) => total + (shot?.length ?? 0), 0);

/** @param {GateFs} fs @param {string} dir @param {ReadonlyMap<string, Uint8Array>} shots
 *  @param {readonly string[]} pruned @returns {Promise<void>} */
async function writeBaselines(fs, dir, shots, pruned) {
  await fs.mkdir(dir, { recursive: true });

  for (const [key, bytes] of shots) {
    await fs.writeFile(path.join(dir, `${key}${PNG_SUFFIX}`), bytes);
  }
  for (const key of pruned) {
    await fs.rm(path.join(dir, `${key}${PNG_SUFFIX}`));
  }
}

/** Capture the corpus and commit it as the new baseline set.
 *
 *  Nothing is written until every shot is in hand and every budget has been cleared: a
 *  half-written baseline set is worse than none, because the next `check` reports its
 *  gaps as changes to a UI nobody touched.
 *  @param {Deps} [deps] @param {Options} [opts] @returns {Promise<CommandResult>} */
export async function accept(deps = defaultDeps(), opts = {}) {
  const { rootDir = REPO_ROOT, filter } = opts;
  const at = under(rootDir);

  try {
    const { variants } = await readPlan(deps, at, filter);
    const { captures, chromium } = await runCapture(deps, at, variants);
    assertSane(captures);

    const shots = acceptableShots(captures);
    const existing = await readBaselines(deps.fs, at(PATHS.baselines));
    const unclaimed = [...existing.keys()].filter((key) => !shots.has(key));

    // Under `--filter` the run covers part of the corpus by design, so a baseline it did
    // not capture is out of scope rather than orphaned — pruning on a filtered run would
    // delete most of the committed set and call it a cleanup. Those survivors still
    // count against the corpus budget, because they are still what lands in git.
    const { pruned, retained } = filter
      ? { pruned: [], retained: sumBytes(unclaimed.map((key) => existing.get(key))) }
      : { pruned: unclaimed, retained: 0 };
    assertWithinBudget(shots, retained);

    await writeBaselines(deps.fs, at(PATHS.baselines), shots, pruned);
    const stamp = { ...(await deps.host()), chromium };
    await deps.fs.writeFile(at(PATHS.baselineEnv), `${JSON.stringify(stamp, null, 2)}\n`);

    return {
      exitCode: EXIT.ok,
      message: `accepted ${shots.size} baseline(s), pruned ${pruned.length}`,
      written: [...shots.keys()],
      pruned,
    };
  } catch (cause) {
    return broken(messageOf(cause));
  }
}

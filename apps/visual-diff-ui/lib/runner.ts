import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildSummary } from '@gate/visual-diff/artifacts';
import { pngSize } from '@gate/visual-diff/capture';
import { type CaptureShot, type Comparison, compareAll } from '@gate/visual-diff/compare';
import {
  BASELINE_BUDGET_BYTES,
  BASELINE_PNG_BUDGET_BYTES,
  EXIT,
  parseVariantKey,
} from '@gate/visual-diff/policy';
import { type HostEnv, hostFingerprint, hostMatches } from './host';
import {
  BASELINE_ENV_FILE,
  type JobOutcome,
  type JobRequest,
  baselinesDir,
  reportDir,
  setDir,
  within,
} from './jobs';
import { hostMismatch, noReportAt } from './refusals';
import { type Summary, SummarySchema } from './summary';

/**
 * The runner: `packages/visual-diff` composed programmatically, always under
 * the app's own data directory.
 *
 * The CLI is never spawned. Its surface is `check | accept` with no `--root`,
 * and `commands.mjs` derives `REPO_ROOT` from `import.meta.url` — so a bare
 * `node cli.mjs` reads and writes the real `packages/visual-diff/__baselines__`
 * and `.visual-diff`, whatever this app intended. Everything below goes through
 * the package's exported functions with paths this module built, and every one
 * of those paths goes through `within()`.
 */

const PNG = '.png';

const shotPath = (dir: string, key: string, kind: string) =>
  path.join(dir, `${key}.${kind}${PNG}`);

/**
 * The PNGs in one capture set, keyed by `policy.variantKey`.
 *
 * A file whose name is not a variant key is reported and skipped rather than
 * carried: `compareAll` would place it under a null tier, and the console's own
 * schema — which is the differ's — has no cell for that. Naming it in the log is
 * what keeps a typo'd filename from reading as a missing story.
 */
function readSet(
  dataDir: string,
  label: string,
  log: (message: string) => void,
): Map<string, Uint8Array> {
  const dir = setDir(dataDir, label);

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    throw new Error(`no capture set at sets/${label}`);
  }

  const shots = new Map<string, Uint8Array>();
  const ignored: string[] = [];

  for (const name of names) {
    const key = name.endsWith(PNG) ? name.slice(0, -PNG.length) : null;
    if (!key || !parseVariantKey(key)) {
      ignored.push(name);
      continue;
    }

    shots.set(key, fs.readFileSync(path.join(dir, name)));
  }

  if (ignored.length > 0) {
    log(`ignored ${ignored.length} file(s) in sets/${label}: ${ignored.join(', ')}`);
  }
  if (shots.size === 0) throw new Error(`the capture set sets/${label} holds no shots`);

  return shots;
}

/** A set's shots as capture results. Dimensions are read out of the PNG header
 *  rather than recorded anywhere: the bytes are what a later run compares. */
function asCaptures(shots: ReadonlyMap<string, Uint8Array>): CaptureShot[] {
  return [...shots].map(([key, bytes]) => {
    // Every key in the map parsed on the way in.
    const variant = parseVariantKey(key)!;
    const size = pngSize(bytes);

    return {
      key,
      id: variant.id,
      tier: variant.tier,
      viewport: variant.viewport,
      theme: variant.theme,
      bucket: 'captured' as const,
      bytes,
      width: size?.width ?? null,
      height: size?.height ?? null,
      violations: [],
      error: null,
    };
  });
}

/** The host as `summary.json` records it. Null fields are dropped rather than
 *  stringified: `env` is a record of what is known, and `"image": "null"` is a
 *  claim about a container that does not exist. */
function summaryEnv(env: HostEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hostFingerprint(env)).filter(([, value]) => value !== null),
  ) as Record<string, string>;
}

/** The report tree: the record, and the three PNGs per reviewable variant.
 *
 *  `unchanged` variants never reach `summary.variants`, so nothing here writes a
 *  shot nobody will open — the same rule the differ's own report follows. */
function writeReport(
  dir: string,
  summary: Summary,
  rows: readonly Comparison[],
  sets: {
    baselines: ReadonlyMap<string, Uint8Array>;
    candidates: ReadonlyMap<string, Uint8Array>;
  },
): void {
  const shots = path.join(dir, 'shots');
  fs.mkdirSync(shots, { recursive: true });

  const diffs = new Map(rows.map((row) => [row.key, row.diff]));
  for (const variant of summary.variants) {
    const baseline = sets.baselines.get(variant.key);
    const candidate = sets.candidates.get(variant.key);
    const diff = diffs.get(variant.key);

    if (baseline) fs.writeFileSync(shotPath(shots, variant.key, 'baseline'), baseline);
    if (candidate) fs.writeFileSync(shotPath(shots, variant.key, 'candidate'), candidate);
    if (diff) fs.writeFileSync(shotPath(shots, variant.key, 'diff'), diff);
  }

  fs.writeFileSync(
    path.join(dir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
}

/**
 * Compare two capture sets, A as baselines and B as candidates.
 *
 * This is the differ's own comparer over two shot trees rather than over a live
 * capture, which is what makes the console usable without a browser: the sets
 * were captured in the pinned container, and comparing them again here moves no
 * pixels.
 */
export async function compareSets(
  dataDir: string,
  request: Extract<JobRequest, { mode: 'compare' }>,
  log: (message: string) => void,
  env: HostEnv = process.env,
): Promise<JobOutcome> {
  const { baseline, candidate } = request;
  const reportId = `${baseline}__${candidate}`;

  const baselines = readSet(dataDir, baseline, log);
  const candidates = readSet(dataDir, candidate, log);
  log(`comparing ${candidates.size} shot(s) against ${baselines.size} baseline(s)`);

  const rows = compareAll({ captures: asCaptures(candidates), baselines, env: {} });
  // Parsed rather than trusted, and parsed HERE: what this writes is what the
  // console will read back through the same schema, so a producer change lands
  // as a failure at the write rather than three screens deep at the read.
  const summary = SummarySchema.parse(buildSummary(rows, summaryEnv(env)));

  const dir = reportDir(dataDir, reportId);
  fs.mkdirSync(dir, { recursive: true });
  writeReport(dir, summary, rows, { baselines, candidates });

  log(`wrote reports/${reportId}/summary.json — ${summary.variants.length} to review`);

  return { exitCode: summary.exitCode, reportId };
}

/** A refusal: the reason goes to the log verbatim, because the alert the panel
 *  renders is this string and a reviewer reading `job_refused` learns nothing. */
function refuse(log: (message: string) => void, reason: string): JobOutcome {
  log(reason);

  return { exitCode: EXIT.broken, reportId: null };
}

/** One report's `summary.json`, or null when there is no readable report there.
 *  Shared with `POST /api/jobs`, whose accept gate asks the same question of the
 *  same file before the lock is claimed. */
export function readSummary(dataDir: string, reportId: string): Summary | null {
  try {
    return SummarySchema.parse(
      JSON.parse(
        fs.readFileSync(path.join(reportDir(dataDir, reportId), 'summary.json'), 'utf8'),
      ),
    );
  } catch {
    return null;
  }
}

/**
 * Every candidate shot the report has to promote, read before a byte is written.
 *
 * A `removed` variant has no candidate by definition — it is a baseline this run
 * did not reproduce — and D2 forbids deleting it as a side effect of an accept,
 * so it is left exactly where it is.
 *
 * An `errored` one does not have a candidate either, and that DOES take the
 * whole accept down: the alternative is a corpus silently one story short, whose
 * next comparison reports that story as `removed` with nothing to say why. The
 * package's own `accept` refuses on the same ground.
 */
function candidateShots(
  dataDir: string,
  reportId: string,
  summary: Summary,
): Map<string, Uint8Array> {
  const shots = path.join(reportDir(dataDir, reportId), 'shots');

  return new Map(
    summary.variants
      .filter((variant) => variant.bucket !== 'removed')
      .map((variant) => {
        const file = shotPath(shots, variant.key, 'candidate');
        try {
          return [variant.key, fs.readFileSync(file)] as const;
        } catch {
          throw new Error(
            `${variant.key} has no candidate shot to promote — nothing was written`,
          );
        }
      }),
  );
}

/** The budgets, checked before the first write. Baselines live in git forever,
 *  so a corpus that would blow the ceiling is refused whole rather than left
 *  half-promoted. */
function assertWithinBudget(
  shots: ReadonlyMap<string, Uint8Array>,
  retained: number,
): void {
  const oversized = [...shots]
    .filter(([, bytes]) => bytes.length > BASELINE_PNG_BUDGET_BYTES)
    .map(([key]) => key);
  if (oversized.length > 0) {
    throw new Error(
      `${oversized.length} baseline(s) over the ${BASELINE_PNG_BUDGET_BYTES}-byte per-file budget (${oversized.join(', ')}) — nothing was written`,
    );
  }

  const total =
    retained + [...shots.values()].reduce((sum, bytes) => sum + bytes.length, 0);
  if (total > BASELINE_BUDGET_BYTES) {
    throw new Error(
      `the baseline set would be ${total} bytes, over the ${BASELINE_BUDGET_BYTES}-byte budget — nothing was written`,
    );
  }
}

/** The bytes already committed that this promotion does not replace. */
function retainedBytes(dir: string, promoted: ReadonlySet<string>): number {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }

  return names
    .filter((name) => name.endsWith(PNG) && !promoted.has(name.slice(0, -PNG.length)))
    .reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
}

/**
 * Promote a report's candidates into `<dataDir>/__baselines__` (D3).
 *
 * NOT the CLI's `accept`, which captures: the shots being promoted were taken
 * in the pinned container and live in the report already, so this copies them
 * and restamps the corpus. It is all-or-nothing — every refusal below happens
 * before the first write, and every byte is in memory before any of them lands.
 *
 * Three things can refuse it, and all three are the point of the gate:
 *  - the running host is not the pinned container (the CLI has NO host guard on
 *    `accept`, so this is the only place that question is ever asked);
 *  - the report still carries an accessibility failure, which no reviewer may
 *    baseline away;
 *  - a variant has no candidate shot, or the corpus would blow its budget.
 */
export async function promoteBaselines(
  dataDir: string,
  reportId: string,
  log: (message: string) => void,
  env: HostEnv = process.env,
): Promise<JobOutcome> {
  const summary = readSummary(dataDir, reportId);
  if (!summary) return refuse(log, noReportAt(reportId));

  if (summary.counts.a11y > 0) {
    return refuse(
      log,
      `this report carries ${summary.counts.a11y} accessibility failure(s) — an accessibility failure is never acceptable as a baseline, so nothing was written`,
    );
  }

  const fingerprint = hostFingerprint(env);
  if (!hostMatches(fingerprint)) {
    // The same sentence the accept gate answered with, plus the half only this
    // gate can promise: it is the last one before a byte would have landed.
    return refuse(log, `${hostMismatch(fingerprint.image)}, so nothing was written`);
  }

  const dir = baselinesDir(dataDir);
  let shots: ReadonlyMap<string, Uint8Array>;
  try {
    shots = candidateShots(dataDir, reportId, summary);
    assertWithinBudget(shots, retainedBytes(dir, new Set(shots.keys())));
  } catch (cause) {
    // Every one of these is "nothing was written", and the message says which:
    // a missing shot and a blown budget are both refusals a reviewer acts on,
    // not crashes. Deliberately scoped to the reads and the budget — a failure
    // once the writes have begun is not a refusal and must not read as one.
    return refuse(log, cause instanceof Error ? cause.message : String(cause));
  }

  fs.mkdirSync(dir, { recursive: true });
  for (const [key, bytes] of shots) {
    fs.writeFileSync(within(dir, `${key}${PNG}`), bytes);
  }
  fs.writeFileSync(
    within(dir, BASELINE_ENV_FILE),
    `${JSON.stringify(fingerprint, null, 2)}\n`,
  );

  log(`promoted ${shots.size} baseline(s) and restamped ${BASELINE_ENV_FILE}`);

  return { exitCode: EXIT.ok, reportId };
}

/**
 * Capture the corpus under the data directory, and compare it — the differ's
 * own `check`, composed rather than spawned, with `rootDir` derived from
 * `VISUAL_DIFF_DATA_DIR`.
 *
 * `capture` and `run` compose the SAME command on purpose: the CLI's surface is
 * `check | accept`, there is no capture-only subcommand, and this issue may not
 * add one. The two modes differ in what the console calls them, not in what the
 * differ does.
 *
 * `check` resolves every `policy.PATHS` entry under `rootDir`, so a real run
 * needs a repo-shaped tree there — `apps/storybook/storybook-static` above all —
 * and a browser, which means the pinned container. **The e2e worlds never run
 * this**: their jobs are compare-only over pre-seeded shot trees. Nothing here
 * fakes a capture; without a Storybook build the composed `check` reports the
 * missing build and the job exits 2, which is the honest answer.
 */
export async function runCheck(
  dataDir: string,
  request: Extract<JobRequest, { mode: 'capture' | 'run' }>,
  log: (message: string) => void,
): Promise<JobOutcome> {
  const rootDir = within(dataDir);
  const { label, filter } = request;
  log(`running check against ${label} under the data directory`);

  // Resolved by Node at the moment it is needed, never bundled: `commands.mjs`
  // derives its repo root from `new URL('../../..', import.meta.url)`, which a
  // bundler reads as an asset import of a directory and refuses to build, and it
  // reaches through `capture.mjs` for `playwright` — a dependency of that
  // package, not of this app. Both are only ever true of a console running on a
  // real checkout, which is the only place this mode can work at all.
  const { check } = await import(
    /* turbopackIgnore: true */ '@gate/visual-diff/commands'
  );
  // Spread rather than passed as `filter: undefined`: `check` reads any filter
  // as "only stories matching this", and an empty box from the console must not
  // arrive as a filter that matches nothing.
  const result = await check(undefined, { rootDir, ...(filter ? { filter } : {}) });
  log(result.message);

  return { exitCode: result.exitCode, reportId: null };
}

/** One job, by mode. The only dispatcher; `POST /api/jobs` hands this to the
 *  job system rather than choosing the work itself. */
export async function runJob(
  dataDir: string,
  request: JobRequest,
  log: (message: string) => void,
  env: HostEnv = process.env,
): Promise<JobOutcome> {
  if (request.mode === 'compare') return compareSets(dataDir, request, log, env);
  if (request.mode === 'accept') {
    return promoteBaselines(dataDir, request.reportId, log, env);
  }

  return runCheck(dataDir, request, log);
}

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import type { Readable } from 'node:stream';
import { buildSummary } from '@gate/visual-diff/artifacts';
import { pngSize } from '@gate/visual-diff/capture';
import { type CaptureShot, type Comparison, compareAll } from '@gate/visual-diff/compare';
import {
  type Ledger,
  pairLedgers,
  serializeLedgerReport,
} from '@gate/visual-diff/ledger';
import { EXIT, HOST, LEDGER, parseVariantKey } from '@gate/visual-diff/policy';
import { BASELINE_ENV, CANONICAL_LABEL, baselinesPath } from './baselines';
import { DATA_MOUNT, REPO_MOUNT, containerArgv } from './docker';
import { type Checkout, describeCheckout, repoRoot } from './git';
import { type HostEnv, hostFingerprint, hostMatches } from './host';
import { type JobOutcome, freeLabel } from './jobs';
import type { JobRequest } from './job-contract';
import { ledgerReportPath, reportDir, setDir } from './paths';
import { NO_CHECKOUT, STORYBOOK_FAILED } from './refusals';
import { type Summary, SummarySchema } from './summary';

/**
 * The runner: `packages/visual-diff` composed programmatically, always under
 * the app's own data directory.
 *
 * The CLI is never spawned. Its surface is `check` with no `--root`, and
 * `commands.mjs` derives `REPO_ROOT` from `import.meta.url` — so a bare `node
 * cli.mjs` reads and writes the real `packages/visual-diff/__baselines__` and
 * `.visual-diff`, whatever this app intended. Everything below goes through the
 * package's exported functions with paths this module built, and every one of
 * those paths goes through `within()`.
 */

const PNG = '.png';

/** What a set records for a checkout git could not describe. Not a blank and not
 *  a guess: the column says outright that this set's provenance is unknown. */
const UNKNOWN = 'unknown';

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
/**
 * Where one label's shots are.
 *
 * Every label but one resolves under the data directory, through `within()`. The
 * canonical corpus is the exception and the only one: it lives in the CHECKOUT,
 * because it is committed rather than captured. This is a READ path — nothing in
 * this app writes anywhere near it, and the delete route refuses the label
 * outright — so the confinement `within()` exists to enforce is not being
 * widened, only the set of directories a compare may read two shot trees from.
 */
function shotsDir(dataDir: string, label: string): string {
  if (label !== CANONICAL_LABEL) return setDir(dataDir, label);

  const root = repoRoot();
  if (!root) throw new Error(NO_CHECKOUT);

  return baselinesPath(root);
}

/** A set as a compare reads it: the shots, and the token ledgers a console capture
 *  wrote beside them — kept as the text on disk, keyed like the shots. Pairing them
 *  across two sets is the report writer's job; here they are only read, so a sidecar
 *  is never reported as an ignored file. */
export interface ReadSet {
  shots: Map<string, Uint8Array>;
  ledgers: Map<string, string>;
}

/** The variant key a file name carries, and which kind of file it is — or null for
 *  a name that is neither a shot nor a ledger of a cell in the matrix. */
function keyOf(name: string): { key: string; kind: 'shot' | 'ledger' } | null {
  const [kind, suffix] = name.endsWith(LEDGER.fileSuffix)
    ? (['ledger', LEDGER.fileSuffix] as const)
    : (['shot', PNG] as const);
  if (!name.endsWith(suffix)) return null;

  const key = name.slice(0, -suffix.length);
  return parseVariantKey(key) ? { key, kind } : null;
}

export function readSet(
  dataDir: string,
  label: string,
  log: (message: string) => void,
): ReadSet {
  const dir = shotsDir(dataDir, label);

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    throw new Error(`no capture set at sets/${label}`);
  }

  const shots = new Map<string, Uint8Array>();
  const ledgers = new Map<string, string>();
  const ignored: string[] = [];

  for (const name of names) {
    // The corpus carries its host stamp beside its shots. Naming it as ignored
    // every time the canonical set is compared would report a file that is
    // supposed to be there.
    if (name === BASELINE_ENV) continue;

    const file = keyOf(name);
    if (!file) {
      ignored.push(name);
      continue;
    }

    const at = path.join(dir, name);
    if (file.kind === 'ledger') ledgers.set(file.key, fs.readFileSync(at, 'utf8'));
    else shots.set(file.key, fs.readFileSync(at));
  }

  if (ignored.length > 0) {
    log(`ignored ${ignored.length} file(s) in sets/${label}: ${ignored.join(', ')}`);
  }
  if (shots.size === 0) throw new Error(`the capture set sets/${label} holds no shots`);

  return { shots, ledgers };
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

/** One variant's report, from the two sidecars as they sit on disk. `origin` is the
 *  after side's when there is one: it says what a change's rect is measured from, and
 *  that rect is the after screenshot's.
 *  @throws on a sidecar that will not parse — the caller is the bulkhead. */
function ledgerReport(
  key: string,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string {
  const read = (text: string | undefined) =>
    text === undefined ? null : (JSON.parse(text) as Ledger);
  const sides = { before: read(before.get(key)), after: read(after.get(key)) };
  const { mode, changes } = pairLedgers(sides.before, sides.after);

  return serializeLedgerReport({
    key,
    mode,
    origin: sides.after?.origin ?? sides.before?.origin ?? 'document',
    changes,
  });
}

/**
 * What the spacing did, beside what the pixels did.
 *
 * Pairing happens HERE rather than in `compare.mjs`, and that is the whole shape of
 * it: a reading is reference beside a comparison, the way a design board is. It
 * carries no bucket, moves no exit code, and `summary.json` is byte-identical to the
 * same compare run over two sets that measured nothing — `__tests__/runner.test.ts`
 * holds that.
 *
 * One file per variant either set measured, which is why a `baselines` before side
 * gives after-only reports on its own: the corpus is committed rather than captured,
 * so it carries no sidecars by construction. Nothing is written at all — not even the
 * directory — when neither set has any.
 *
 * A BULKHEAD, the same one the capture puts around the ledger: a sidecar that will
 * not parse costs its own panel and nothing else. The report and the exit code are
 * already on disk by the time this runs.
 */
function writeLedgerReports(
  dir: string,
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  log: (message: string) => void,
): void {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  if (keys.length === 0) return;

  fs.mkdirSync(path.join(dir, LEDGER.reportDir), { recursive: true });

  let written = 0;
  for (const key of keys) {
    try {
      fs.writeFileSync(ledgerReportPath(dir, key), ledgerReport(key, before, after));
      written += 1;
    } catch (cause) {
      log(`could not pair the token ledgers for ${key}: ${String(cause)}`);
    }
  }

  log(`paired ${written} token ledger(s)`);
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

  const before = readSet(dataDir, baseline, log);
  const after = readSet(dataDir, candidate, log);
  const { shots: baselines } = before;
  const { shots: candidates } = after;
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
  // After the report, never before it: the summary is the comparison's answer, and a
  // ledger that would not pair must not be why it is missing.
  writeLedgerReports(dir, before.ledgers, after.ledgers, log);

  return { exitCode: summary.exitCode, reportId };
}

/** A refusal: the reason goes to the log verbatim, because the alert the panel
 *  renders is this string and a reviewer reading `job_refused` learns nothing. */
function refuse(log: (message: string) => void, reason: string): JobOutcome {
  log(reason);

  return { exitCode: EXIT.broken, reportId: null };
}

/** The script that does the capture, relative to the checkout — the same path
 *  inside the container, because the checkout is mounted at its root. */
const CAPTURE_SET = 'apps/visual-diff-ui/scripts/capture-set.mjs';

/** The Storybook build `check` serves. Built on the host before the container
 *  starts: static output is not platform-dependent, and building it inside a
 *  container with no package manager would be a second problem. */
const STORYBOOK_BUILD = ['--filter', '@gate/storybook', 'build'];

/** How much of a quiet process's output a failure is worth. A Vite build that
 *  went wrong says so near the end; the two thousand asset lines above it are
 *  what made the build quiet in the first place. */
const TAIL_LINES = 40;

/**
 * One child process, with what it writes going to the job log.
 *
 * `spawn` without a shell, so a repo path with a space in it is an argument
 * rather than a quoting bug. Resolves with the exit code; a process that could
 * not be started at all resolves too, with its reason logged — a job that ends
 * is a history row, and a promise that rejected here would be a lock nobody
 * released.
 *
 * `quiet` holds the output back instead of streaming it, and releases the tail
 * only if the process fails. The Storybook build is the reason: it writes a line
 * per built asset, some two thousand of them, and a live log that has to be
 * scrolled past them is a live log nobody reads the capture in. A build that
 * failed is the one time those lines are what the reviewer needs.
 */
function run(
  command: string,
  args: readonly string[],
  cwd: string,
  log: (message: string) => void,
  quiet = false,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const held: string[] = [];

    const take = (line: string) => {
      if (!quiet) {
        log(line);
        return;
      }

      held.push(line);
      if (held.length > TAIL_LINES) held.shift();
    };

    // Line-buffered on purpose: the panel renders the log as lines, and a chunk
    // boundary is not a line boundary.
    const forward = (stream: Readable) => {
      const lines = readline.createInterface({ input: stream });
      lines.on('line', take);
    };

    forward(child.stdout);
    forward(child.stderr);

    const done = (code: number) => {
      if (code !== 0) for (const line of held) log(line);
      resolve(code);
    };

    child.on('error', (cause) => {
      log(`${command} could not be started: ${cause.message}`);
      resolve(EXIT.broken);
    });
    child.on('close', (code) => done(code ?? EXIT.broken));
  });
}

/**
 * How this console runs a capture: as itself, or as the pinned container.
 *
 * `check` guards its host before it takes a shot, so off the pinned image a
 * capture is refused — and the differ's README answers that with a `docker run`
 * to paste. Pasting is what this console exists to avoid, so it runs the
 * container itself and the reviewer watches the log. On the pinned image there
 * is nothing to wrap: the capture runs directly.
 */
function captureArgv(
  rootDir: string,
  dataDir: string,
  label: string,
  filter: readonly string[] | undefined,
  root: Checkout | null,
): { command: string; args: string[]; inContainer: boolean } {
  const inContainer = !hostMatches();
  const at = (dir: string) => (inContainer ? dir : undefined);

  const script = [
    inContainer ? `${REPO_MOUNT}/${CAPTURE_SET}` : path.join(rootDir, CAPTURE_SET),
    '--root',
    at(REPO_MOUNT) ?? rootDir,
    '--data-dir',
    at(DATA_MOUNT) ?? dataDir,
    '--label',
    label,
    // One `--filter` per ticked component, which `capture-set.mjs` collects back
    // into the list `matchesFilter` reads as a union. An empty list passes none:
    // the differ reads no filter as the whole corpus, and a `--filter` with
    // nothing after it would be a flag with no value.
    ...(filter ?? []).flatMap((value) => ['--filter', value]),
    // Git is the host's answer: the container has no `.git` worth reading and
    // may have no `git` at all, and a set's provenance is not a thing to guess.
    '--sha',
    root?.sha ?? UNKNOWN,
    '--branch',
    root?.branch ?? UNKNOWN,
    ...(root ? ['--dirty', String(root.dirty)] : []),
  ];

  return inContainer
    ? {
        command: 'docker',
        args: containerArgv(rootDir, dataDir, ['node', ...script]),
        inContainer,
      }
    : { command: process.execPath, args: script, inContainer };
}

/**
 * Capture the corpus into a set, and compare it against the committed
 * baselines.
 *
 * `capture` and `run` compose the SAME command on purpose: the differ's surface
 * is `check | accept` and there is no capture-only subcommand. The two modes
 * differ in what the console calls them, not in what the differ does.
 *
 * TWO DIRECTORIES, and the split is the thing to keep straight. The CHECKOUT is
 * where `check` resolves every `policy.PATHS` entry — the Storybook build it
 * serves, the committed baselines it compares against, and its own artifacts
 * under `packages/visual-diff/.visual-diff/`. The DATA directory receives the
 * capture set and nothing else. Both are mounted into the container separately,
 * because `VISUAL_DIFF_DATA_DIR` may point anywhere and a path that only works
 * when it happens to sit inside the checkout is a trap.
 *
 * SPAWNED, not composed. Every other mode in this file runs the differ in
 * process; this one cannot, because the work has to happen inside the pinned
 * image and what crosses that boundary is argv. `scripts/capture-set.mjs` is the
 * one implementation, run through `docker` from a developer's machine and
 * directly when the console is already on the pinned image — so there is no
 * second code path that only the container takes.
 *
 * **The e2e acceptance worlds never run this** — their jobs are compare-only
 * over pre-seeded shot trees. `features/local/accept-loop.feature` does, against
 * whatever the machine running it has.
 */
export async function runCheck(
  dataDir: string,
  request: Extract<JobRequest, { mode: 'capture' }>,
  log: (message: string) => void,
  cwd: string = process.cwd(),
): Promise<JobOutcome> {
  const rootDir = repoRoot(cwd);
  if (!rootDir) return refuse(log, NO_CHECKOUT);

  const label = freeLabel(dataDir, request.label);
  if (label !== request.label) {
    log(`${request.label} is already captured — this run is ${label}`);
  }

  // Built every run rather than when it looks stale: "looks stale" is a mtime
  // comparison against every story file, and a capture of a build that is one
  // commit behind is a report about code nobody is looking at. Turborepo makes a
  // no-op build cheap.
  log('building storybook');
  const built = await run('pnpm', STORYBOOK_BUILD, rootDir, log, true);
  if (built !== 0) return refuse(log, STORYBOOK_FAILED);

  const { command, args, inContainer } = captureArgv(
    rootDir,
    dataDir,
    label,
    request.filter,
    describeCheckout(rootDir),
  );
  log(
    inContainer
      ? `capturing into sets/${label} inside ${HOST.image}`
      : `capturing into sets/${label}`,
  );

  const exitCode = await run(command, args, rootDir, log);

  return { exitCode, reportId: null };
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

  return runCheck(dataDir, request, log);
}

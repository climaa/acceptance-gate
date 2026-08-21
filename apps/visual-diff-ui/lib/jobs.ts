import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXIT } from '@gate/visual-diff/policy';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { PURGE, REPORTS_TAG, SETS_TAG, reportTag } from './data';
import { CANONICAL_LABEL } from './baselines';
import { type CaptureSet, SetsFileSchema } from './summary';

/**
 * The job system: the data-directory layout every write in this app goes
 * through, the one-job-at-a-time lock (D1), the appendable log, and the history
 * of what has run.
 *
 * The layout this module owns, all of it under `VISUAL_DIFF_DATA_DIR`:
 *
 *     <dataDir>/sets/<label>/<variantKey>.png   one capture set's shot tree
 *     <dataDir>/reports/<id>/summary.json       one comparison's record
 *     <dataDir>/history.json                    every run, newest first
 *     <dataDir>/worktrees.json                  which sets are held (D2)
 *     <dataDir>/job.lock                        the one-job-at-a-time lock (D1)
 *     <dataDir>/jobs/<jobId>.log                one run's output stream
 *     <dataDir>/__baselines__/                  what `accept` promotes into (D3)
 *
 * Nothing here knows how to run a job. `startJob` takes the work as an
 * argument, so the runner — which reaches for the differ, PNG bytes and a
 * browser — is not in the import graph of the lock.
 *
 * Every filesystem call is synchronous, deliberately. The lock's exclusive
 * create must not interleave with anything, and everything else here is one
 * lock file, one log line or one small JSON array; the read path (lib/data.ts)
 * is where async pays for itself.
 */

/** Every mode `POST /api/jobs` accepts. */
export const JobModeSchema = z.enum(['capture', 'compare', 'run', 'accept']);
export type JobMode = z.infer<typeof JobModeSchema>;

/**
 * A snapshot-set label. No underscore, so `<a>__<b>` splits back into the two
 * labels it names — the same reason `policy.variantKey` can join on `__`.
 */
const SET_LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/** A report id: one directory name, `<setA>__<setB>`. Matches lib/data.ts's own
 *  read-side shape, so an id the console can write is an id it can read back. */
const REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export const SetLabelSchema = z.string().regex(SET_LABEL, 'not a snapshot-set label');
const ReportIdSchema = z.string().regex(REPORT_ID, 'not a report id');

/** The `--filter` values: substrings matched against story ids and titles, so
 *  anything is a legal value and only the shape is a contract. A LIST, because
 *  the panel offers the corpus as checkboxes and a reviewer ticks as many as they
 *  mean — `matchesFilter` reads several as a union. Optional, and an empty list is
 *  the same thing as absent: the whole corpus, which is what the gate runs. */
const FilterSchema = z.array(z.string()).optional();

/**
 * What `POST /api/jobs` accepts, per mode. A discriminated union rather than one
 * object with optional fields: a `compare` with no candidate and an `accept`
 * with no report are refusals at the boundary, not `undefined` three calls deep.
 */
export const JobRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('compare'),
    baseline: SetLabelSchema,
    candidate: SetLabelSchema,
  }),
  z.object({ mode: z.literal('accept'), reportId: ReportIdSchema }),
  z.object({ mode: z.literal('capture'), label: SetLabelSchema, filter: FilterSchema }),
  z.object({ mode: z.literal('run'), label: SetLabelSchema, filter: FilterSchema }),
]);

export type JobRequest = z.infer<typeof JobRequestSchema>;

/**
 * One row of `history.json`. `outcome` is deliberately absent: it is derived
 * from `exitCode` where it is displayed, and a stored copy is a verdict that can
 * disagree with the code it claims to describe.
 *
 * `endedAt`, `exitCode` and `reportId` are null while the job runs — and stay
 * null for a job that was interrupted, which is exactly what a reader needs to
 * tell "still going" and "never finished" from "finished, code 2".
 */
export const HistoryRecordSchema = z
  .object({
    id: z.string(),
    mode: JobModeSchema,
    label: z.string(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    exitCode: z.number().nullable(),
    reportId: z.string().nullable(),
  })
  .strict();

export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

const HistorySchema = z.array(HistoryRecordSchema);

/** What the lock file says. `pid` is the whole staleness test: a lock whose
 *  process is gone is a job nobody is running. */
const LockSchema = z.object({
  pid: z.number(),
  mode: JobModeSchema,
  label: z.string(),
  startedAt: z.string(),
});

export type Lock = z.infer<typeof LockSchema>;

/** The D2 hold: a set checked out into a worktree is not the console's to delete. */
const WorktreeSchema = z.object({
  path: z.string(),
  set: z.string(),
  registeredAt: z.string(),
});

export const WorktreesFileSchema = z.object({ worktrees: z.array(WorktreeSchema) });

export type Worktree = z.infer<typeof WorktreeSchema>;

/** A path that would have landed outside the data directory. Thrown, never
 *  returned: an escaped write corrupts the corpus the whole gate protects, so
 *  the only safe answer is to stop rather than to fall back to something. */
class ConfinementError extends Error {}

/**
 * `path.resolve` under the data directory, and nothing else — the one gate every
 * write in this app passes through.
 *
 * The check is on the RESOLVED path, so `..`, an absolute segment and a sibling
 * directory sharing the data dir's prefix are all refused. Route handlers
 * validate their URL segments first and answer 404; reaching this is a bug, and
 * it says so by throwing.
 */
export function within(dataDir: string, ...segments: string[]): string {
  const base = path.resolve(dataDir);
  const target = path.resolve(base, ...segments);

  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new ConfinementError(`${target} is outside the data directory ${base}`);
  }

  return target;
}

export const setDir = (dataDir: string, label: string) => within(dataDir, 'sets', label);
export const reportDir = (dataDir: string, id: string) => within(dataDir, 'reports', id);
export const baselinesDir = (dataDir: string) => within(dataDir, '__baselines__');
export const setsFilePath = (dataDir: string) => within(dataDir, 'sets.json');

/** The stamp `accept` restamps, named here because the log names it back. */
export const BASELINE_ENV_FILE = 'BASELINE_ENV.json';

const lockPath = (dataDir: string) => within(dataDir, 'job.lock');
const historyPath = (dataDir: string) => within(dataDir, 'history.json');
const worktreesPath = (dataDir: string) => within(dataDir, 'worktrees.json');
const logPath = (dataDir: string, id: string) => within(dataDir, 'jobs', `${id}.log`);

/** A JSON file that may not be there yet: an instance that has run nothing has
 *  no history and no registry. Unreadable or malformed is a different thing and
 *  says so, naming the file — a half-written `history.json` is what a crash
 *  mid-rewrite leaves behind, and every later request would report it. */
function readJson<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new Error(`Could not read ${file}`, { cause });
  }

  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new Error(`Could not parse ${file}`, { cause });
  }

  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`${file} does not match its schema`);

  return result.data;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The registered worktrees, or an empty registry when nothing holds anything. */
function readWorktrees(dataDir: string): Worktree[] {
  return readJson(worktreesPath(dataDir), WorktreesFileSchema, { worktrees: [] })
    .worktrees;
}

/** The worktree holding `label`, or null. The refusal names the path, so the
 *  reviewer knows which checkout to retire before trying again. */
export function holderOf(dataDir: string, label: string): Worktree | null {
  return readWorktrees(dataDir).find((worktree) => worktree.set === label) ?? null;
}

/** Code-unit order, never `localeCompare`: collation depends on the host's ICU
 *  build, and a prune must decide the same way on every machine that runs it. */
function descending(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? 1 : -1;
}

/**
 * The capture sets this instance has, newest first.
 *
 * Uncached and synchronous, unlike `readSets` in lib/data.ts: this is what a
 * mutation reads immediately before rewriting the file, and reading the console's
 * cached copy there would delete against a list that may be seconds stale.
 *
 * `capturedAt` decides, the label breaks ties: two sets captured on one day are
 * still an order a prune has to agree with itself about.
 */
export function listSets(dataDir: string): CaptureSet[] {
  return [...readJson(setsFilePath(dataDir), SetsFileSchema, { sets: [] }).sets].sort(
    (left, right) =>
      descending(left.capturedAt, right.capturedAt) ||
      descending(left.label, right.label),
  );
}

/**
 * Delete one capture set: its shot tree and its registry entry, in that order.
 *
 * Only ever called once a caller has established the set is not held — this
 * function refuses nothing, it is the deletion the refusals guard. A shot tree
 * on disk with no registry entry is left alone by everything else in this app:
 * nothing is deleted implicitly (D2), and an unregistered directory is
 * something a human put there.
 */
export function removeSet(dataDir: string, label: string): void {
  fs.rmSync(setDir(dataDir, label), { recursive: true, force: true });

  const file = setsFilePath(dataDir);
  const registry = readJson(file, SetsFileSchema, { sets: [] });
  writeJson(file, {
    ...registry,
    sets: registry.sets.filter((set) => set.label !== label),
  });
}

/** Whether this instance has that set at all — either as a shot tree or as a
 *  registry entry, since a half-written capture is still something to delete. */
export function hasSet(dataDir: string, label: string): boolean {
  return (
    fs.existsSync(setDir(dataDir, label)) ||
    listSets(dataDir).some((set) => set.label === label)
  );
}

/**
 * A label this instance does not have yet: the one asked for, or it with a
 * counter appended.
 *
 * The canonical corpus counts as taken. It is not in `sets.json` — nothing in
 * this app put it there — so `hasSet` cannot see it, and a capture called
 * `baselines` would otherwise shadow it in the compare pickers.
 *
 * Labels are date-shaped, so capturing twice in one day asks for a name that is
 * already taken. Neither of the other answers is right — overwriting changes a
 * set under any report already built from it, and refusing throws away a run
 * whose only fault is happening on a Tuesday that already had one. The suffix
 * keeps both sets and keeps `capturedAt` honest about them.
 */
export function freeLabel(dataDir: string, label: string): string {
  const taken = (candidate: string) =>
    candidate === CANONICAL_LABEL || hasSet(dataDir, candidate);

  if (!taken(label)) return label;

  for (let counter = 2; ; counter += 1) {
    const candidate = `${label}-${counter}`;
    if (!taken(candidate)) return candidate;
  }
}

/**
 * Register one capture set — the mirror of {@link removeSet}.
 *
 * The runner writes the shot tree; this is the row that makes it a set the
 * console can see. Newest first, and a label claims one row: a re-registered
 * label replaces its entry rather than appearing twice, which `listSets` has no
 * way to choose between. Spreading the registry keeps a fixture's `isSample`
 * provenance, exactly as `removeSet` does.
 */
export function recordSet(dataDir: string, set: CaptureSet): void {
  const file = setsFilePath(dataDir);
  const registry = readJson(file, SetsFileSchema, { sets: [] });

  writeJson(file, {
    ...registry,
    sets: [set, ...registry.sets.filter((entry) => entry.label !== set.label)],
  });
}

/** Every run, newest first. */
export function readHistory(dataDir: string): HistoryRecord[] {
  return readJson(historyPath(dataDir), HistorySchema, []);
}

function writeHistory(dataDir: string, records: readonly HistoryRecord[]): void {
  writeJson(historyPath(dataDir), records);
}

/** Newest first, so the console's table order is the file's order. */
function appendHistory(dataDir: string, record: HistoryRecord): void {
  writeHistory(dataDir, [record, ...readHistory(dataDir)]);
}

function patchHistory(dataDir: string, id: string, patch: Partial<HistoryRecord>): void {
  writeHistory(
    dataDir,
    readHistory(dataDir).map((record) =>
      record.id === id ? { ...record, ...patch } : record,
    ),
  );
}

export function readLock(dataDir: string): Lock | null {
  return readJson(lockPath(dataDir), LockSchema.nullable(), null);
}

/** Exclusive create — the whole of D1. Two requests racing here both reach the
 *  filesystem, and the kernel refuses the second, so "one job at a time" is not
 *  a read-then-write this process could interleave. */
function claimLock(dataDir: string, lock: Lock): boolean {
  const file = lockPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    fs.writeFileSync(file, `${JSON.stringify(lock)}\n`, { flag: 'wx' });
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw cause;
  }
}

function releaseLock(dataDir: string): void {
  fs.rmSync(lockPath(dataDir), { force: true });
}

/** Whether a process is still there. `EPERM` is alive-but-not-ours, which is
 *  emphatically not stale: reaping it would hand the lock to a second job while
 *  the first still runs. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The job id for a run: the moment it started, colon-free so it is a filename,
 *  and the mode. Derived rather than stored on the lock, so a lock left behind
 *  by a dead process still names the history row it belongs to. */
export function jobId(startedAt: string, mode: JobMode): string {
  return `${startedAt.replace(/\.\d+Z$/, 'Z').replaceAll(':', '-')}-${mode}`;
}

/** What a run is about, in one string the history table can show. */
export function jobLabel(request: JobRequest): string {
  if (request.mode === 'compare') return `${request.baseline}__${request.candidate}`;
  if (request.mode === 'accept') return request.reportId;

  return request.label;
}

/**
 * Retire a lock whose process is gone.
 *
 * The interrupted run keeps its row and its nulls — `exitCode: null` is the
 * record of a job that never reported one, and inventing a 2 here would claim
 * the differ said something it never got to say.
 */
export function reapStaleLock(dataDir: string): HistoryRecord | null {
  const lock = readLock(dataDir);
  if (!lock || isAlive(lock.pid)) return null;

  const id = jobId(lock.startedAt, lock.mode);
  const interrupted: HistoryRecord = {
    id,
    mode: lock.mode,
    label: lock.label,
    startedAt: lock.startedAt,
    endedAt: null,
    exitCode: null,
    reportId: null,
  };
  if (!readHistory(dataDir).some((record) => record.id === id)) {
    appendHistory(dataDir, interrupted);
  }
  releaseLock(dataDir);

  return interrupted;
}

/** The job running right now, or null. A lock whose process is gone is not a
 *  current job — the console must not show a spinner for a dead pid. */
export function currentJob(dataDir: string): HistoryRecord | null {
  const lock = readLock(dataDir);
  if (!lock || !isAlive(lock.pid)) return null;

  const id = jobId(lock.startedAt, lock.mode);

  return (
    readHistory(dataDir).find((record) => record.id === id) ?? {
      id,
      mode: lock.mode,
      label: lock.label,
      startedAt: lock.startedAt,
      endedAt: null,
      exitCode: null,
      reportId: null,
    }
  );
}

/**
 * How much of the end of a log file is read to satisfy a bounded tail.
 *
 * The poll endpoint asks for 200 lines once a second for as long as a job runs,
 * and this used to answer by reading the WHOLE file and throwing away all but
 * the end of it — so the cost of watching a job grew with the log it was
 * writing, forever, because these files are appended to and never rotated.
 *
 * 128 KB holds the tail the console asks for many times over for anything a
 * build or a capture emits line by line. It is a guess, not a cap: a log whose
 * last 128 KB holds too few lines is re-read in full rather than answered
 * short — see `readTail`, which is also where the reason it does that in ONE
 * further read rather than by doubling is written down.
 */
const TAIL_WINDOW = 128 * 1024;

const splitLines = (raw: string): string[] =>
  raw.split('\n').filter((line) => line.length > 0);

/**
 * The whole lines in `file` between `from` and its end.
 *
 * The first line is dropped whenever the read did not start at byte zero: a
 * read that begins mid-file almost certainly begins mid-line, and half a line
 * is not a line. Dropping it also discards any partial UTF-8 sequence the
 * offset landed inside, which is the only place one could appear.
 */
function linesFrom(handle: number, from: number, size: number): string[] {
  const buffer = Buffer.alloc(size - from);
  fs.readSync(handle, buffer, 0, buffer.length, from);

  const lines = splitLines(buffer.toString('utf8'));

  return from === 0 ? lines : lines.slice(1);
}

/**
 * The last `tail` lines of `file`, read from the end rather than from the start.
 *
 * Two reads at most, and the second one is the whole file.
 *
 * The first version of this doubled the window until it found enough lines,
 * which is the obvious shape and the wrong one: a log holding FEWER lines than
 * were asked for makes it walk all the way to the end anyway, one doubling at a
 * time. Measured on a 63 MB log of three lines, that was ten passes reading
 * 127 MB in total to answer with the same three lines a single read gives.
 *
 * Not a contrived shape, either. `appendLog` only breaks on `\n`, and plenty of
 * tools draw progress with `\r` — `docker pull` and Playwright among them — so
 * one multi-megabyte line is an ordinary way for a capture log to look, and this
 * is re-read every second for as long as the job runs.
 *
 * So: try the tail window, and if that does not hold enough lines, stop
 * guessing. A log whose last 128 KB holds fewer than `tail` lines has lines
 * measured in kilobytes, and no amount of doubling is going to beat reading it.
 */
function readTail(file: string, tail: number): string[] {
  const handle = fs.openSync(file, 'r');

  try {
    const size = fs.fstatSync(handle).size;
    const from = Math.max(0, size - TAIL_WINDOW);
    const near = linesFrom(handle, from, size);

    // `from === 0` means the window already covered the file, so there is
    // nothing older to go back for and this is the whole answer.
    if (from === 0 || near.length >= tail) return near.slice(-tail);

    return linesFrom(handle, 0, size).slice(-tail);
  } finally {
    fs.closeSync(handle);
  }
}

/** One job's log, oldest line first. Missing is empty: a job that has said
 *  nothing yet is not an error. */
export function jobLog(dataDir: string, id: string, tail = Infinity): string[] {
  try {
    // `logPath` inside the try, not above it: it throws `ConfinementError` for
    // an id that would escape the data directory, and a history row or a lock
    // carrying one is corrupt state rather than an attack — `within` has
    // already refused the path either way, so nothing is read regardless.
    //
    // Outside the try, that throw reached `GET /api/jobs/current`, which has no
    // handler, and took the poll endpoint down once a second for as long as the
    // bad record sat there. An empty log is this function's documented answer
    // for a log it cannot read, and a corrupt id is exactly that.
    const file = logPath(dataDir, id);

    // An unbounded ask is the whole file by definition, so there is no end to
    // read from — `runDetached` uses it to attach a finished job's full log to
    // its history row.
    if (tail === Infinity) return splitLines(fs.readFileSync(file, 'utf8'));

    return tail <= 0 ? [] : readTail(file, tail);
  } catch {
    return [];
  }
}

function appendLog(dataDir: string, id: string, message: string): void {
  const file = logPath(dataDir, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Split rather than escape: a multi-line message stays readable, and the
  // contract a reader depends on is about the LAST line, which only this module
  // ever writes.
  const lines = message.split('\n').map((line) => `${line}\n`);
  fs.appendFileSync(file, lines.join(''));
}

/** What a job came to. `reportId` is what the console navigates to afterwards. */
export interface JobOutcome {
  exitCode: number;
  reportId?: string | null;
}

/** The work one mode does. Injected rather than imported so this module — and
 *  every test of the lock — stays clear of the differ. */
export type JobWork = (
  dataDir: string,
  request: JobRequest,
  log: (message: string) => void,
) => Promise<JobOutcome>;

export interface StartedJob {
  job: HistoryRecord;
  /** Settles when the detached run has finished. The route never awaits it —
   *  `POST /api/jobs` answers as soon as the lock is held — but a test must. */
  done: Promise<void>;
}

export type StartOutcome =
  { ok: true; started: StartedJob } | { ok: false; running: HistoryRecord | null };

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Refresh what the console is looking at.
 *
 * Wrapped, because this runs in the job's detached tail rather than in the
 * request that started it: a cache refresh that cannot happen must not turn a
 * finished job into an unhandled rejection, and the log already carries the
 * job's real verdict by the time this runs.
 */
function refreshConsole(reportId: string | null): void {
  try {
    revalidateTag(SETS_TAG, PURGE);
    revalidateTag(REPORTS_TAG, PURGE);
    if (reportId) revalidateTag(reportTag(reportId), PURGE);
  } catch {
    // Nothing to say here that the log has not already said.
  }
}

/** Run the work, then close the job out: the log's last line, the history row,
 *  and only then the lock — a poller that sees no lock must find a finished row
 *  rather than a job that has vanished. */
async function runDetached(
  dataDir: string,
  request: JobRequest,
  job: HistoryRecord,
  work: JobWork,
): Promise<void> {
  const log = (message: string) => appendLog(dataDir, job.id, message);

  try {
    let outcome: JobOutcome;
    try {
      outcome = await work(dataDir, request, log);
    } catch (cause) {
      log(messageOf(cause));
      outcome = { exitCode: EXIT.broken };
    }

    log(`exit ${outcome.exitCode}`);
    patchHistory(dataDir, job.id, {
      endedAt: new Date().toISOString(),
      exitCode: outcome.exitCode,
      reportId: outcome.reportId ?? null,
    });
    refreshConsole(outcome.reportId ?? null);
  } finally {
    releaseLock(dataDir);
  }
}

/**
 * Start a job, or say which one is already running (D1).
 *
 * Returns as soon as the lock is held: the run itself is detached, and the only
 * things a caller can see of it are the log — whose last line is `exit <code>` —
 * and the history row. There is no queue on purpose; a second request is
 * refused, and the console shows the running job instead.
 */
export function startJob(
  dataDir: string,
  request: JobRequest,
  work: JobWork,
): StartOutcome {
  reapStaleLock(dataDir);

  const startedAt = new Date().toISOString();
  const label = jobLabel(request);
  if (!claimLock(dataDir, { pid: process.pid, mode: request.mode, label, startedAt })) {
    return { ok: false, running: currentJob(dataDir) };
  }

  const job: HistoryRecord = {
    id: jobId(startedAt, request.mode),
    mode: request.mode,
    label,
    startedAt,
    endedAt: null,
    exitCode: null,
    reportId: null,
  };
  appendHistory(dataDir, job);

  return { ok: true, started: { job, done: runDetached(dataDir, request, job, work) } };
}

import { z } from 'zod';

/**
 * What a job IS, as data: the shapes a request may take, the rows a run leaves
 * behind, and the two files the console keeps beside them.
 *
 * Split out of lib/jobs.ts, which owns the machinery that acts on all of it — the
 * lock, the log, the history rewrite, the detached spawn. That module reaches
 * `node:fs` and `node:child_process` on every other line, and this one is the
 * half three client components were already importing from it: `HistoryRecord` is
 * the type `CurrentJob`, `HistoryTable` and `DashboardTemplate` render. They were
 * importing it correctly, as `import type`, which erases at compile time and
 * pulled nothing into the browser bundle — but that was a property of how the
 * import was written rather than of what it named, and `JobModeSchema` and
 * `JobRequestSchema` are VALUES in that same file. The first client component to
 * want one for validation would have found out the hard way.
 *
 * `RunPanel` already shows what the shape of routing around it looks like: its
 * `jobRequest()` builds the body for `POST /api/jobs` as a bare
 * `Record<string, unknown>`, hand-agreeing with a schema it could not import.
 * Nothing here changes that yet; what changes is that it is now importable.
 *
 * ZERO `node:` imports, and that is the whole contract of this file. Zod and the
 * two patterns below, nothing else — so a client component, a route handler, the
 * job engine and lib/paths.ts can all name the same shapes without any of them
 * inheriting another's runtime.
 */

/**
 * A snapshot-set label. No underscore, so `<a>__<b>` splits back into the two
 * labels it names — the same reason `policy.variantKey` can join on `__`.
 */
export const SET_LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * A report id: one directory name, `<setA>__<setB>`.
 *
 * One regex, where lib/jobs.ts and lib/data.ts each had an identical copy and
 * jobs.ts's comment said "Matches lib/data.ts's own read-side shape" rather than
 * importing it. #359 made it one; it lives here rather than in lib/paths.ts
 * because what may name a directory is a fact about the data before it is a fact
 * about the filesystem — and because lib/paths.ts reaches `node:path`, which this
 * module may not. `reportDirOf` imports it from here to decide the same question
 * on the way to the disk.
 */
export const REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Every mode a history row or a lock may RECORD — which is not the same list as
 * the one `POST /api/jobs` accepts, and the difference is deliberate.
 *
 * `run` and `accept` are here and nowhere else, for one reason each and the same
 * mechanism. `run` was a second name for `capture`: both modes reached
 * `runCheck`, which never read `request.mode` and built the same argv from the
 * same label and filter, so the console offered two tabs that spawned one job.
 * `accept` promoted into `<dataDir>/__baselines__`, gitignored, which meant the
 * one control that looked like the sign-off could not produce a commit.
 *
 * Both tabs are gone (see `JobRequestSchema`), but the rows they already wrote
 * are not — and this enum is what `HistoryRecordSchema` and the lock validate
 * against. Dropping either literal would fail every one of those rows, and
 * `readJson` throws the whole file away on a schema miss: a console that had
 * forgotten its own history to tidy up an enum.
 *
 * So they stay readable and stop being writable. Nothing can produce a new one.
 */
// Not exported: every reader of a mode wants the TYPE, and the two schemas below
// are the only things that validate one. `JobMode` carries the union outward.
const JobModeSchema = z.enum(['capture', 'compare', 'run', 'accept']);
export type JobMode = z.infer<typeof JobModeSchema>;

export const SetLabelSchema = z.string().regex(SET_LABEL, 'not a snapshot-set label');
export const ReportIdSchema = z.string().regex(REPORT_ID, 'not a report id');

/**
 * A branch name as the nearest thing to it a set label can hold, joined to the
 * day — or null when there is no such thing.
 *
 * Written in this module rather than beside the panel that offers it, because
 * `SET_LABEL` is here: a suggestion the console could not post would be worse
 * than no suggestion, and the two staying in one file is what keeps that from
 * becoming a comment nobody re-checks. `__tests__/jobs.test.ts` runs every case
 * below back through `SetLabelSchema` for the same reason.
 *
 * A run of forbidden characters collapses to ONE separator, not one each:
 * `feat//x` is a single boundary, and `feat--x` would read as the `-2` suffix
 * `freeLabel` appends. Both edges come off for the two halves of the same rule —
 * the regex demands an alphanumeric first character, and a trailing separator
 * would meet the day below as `feat--2026-08-24`.
 *
 * Null rather than a fallback stem. `main` would be a lie a reviewer could act
 * on, and `unknown` reads as a failure in a field whose whole job is to be typed
 * over; the caller offers no suggestion at all instead. A detached HEAD never
 * reaches that — `describeCheckout` already answers with the literal `detached`,
 * which is a legal stem and the honest one.
 *
 * Case is deliberately left alone. `hasSet` reaches `fs.existsSync`, so on a
 * case-folding filesystem `Main-…` already reads as taken when `main-…` exists
 * and on a case-sensitive one it does not; normalising here would make this
 * answer a different question from the one `freeLabel` answers, and `freeLabel`
 * is what names the directory.
 */
export function branchLabel(branch: string, day: string): string | null {
  const stem = branch
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+|[.-]+$/g, '');
  if (!stem) return null;

  const label = `${stem}-${day}`;

  // The composed answer, checked rather than assumed. Everything above argues it
  // cannot fail; this is what makes that argument a test rather than a belief.
  return SET_LABEL.test(label) ? label : null;
}

/**
 * `YYYY-MM-DD` on the same clock the set registry is stamped from: UTC.
 *
 * `now` is an argument with a default — the shape `repoRoot(from = process.cwd())`
 * uses one module over — so a test reaches both answers without moving a clock.
 *
 * UTC, because a label is read beside a date this app writes elsewhere:
 * `scripts/capture-set.mjs` stamps `capturedAt` with
 * `new Date().toISOString().slice(0, 10)`, and `listSets` below sorts on
 * `capturedAt` with the label as tiebreak. Two clocks put a set in the table
 * under a date its own name denies — which is what this used to do. It read
 * LOCAL, on the claim that `capture-set.mjs` read local too; that claim was
 * simply wrong, and east of Greenwich the gap opened every night between
 * midnight and the offset: the wand offered `branch-2026-08-25` for a set
 * stamped `2026-08-24`.
 *
 * A stored date is compared against other stored dates, never read against the
 * reader's clock — the opposite of the rendered instants in lib/outcome.ts,
 * which parse to local for exactly that reason.
 *
 * Composed from the parts rather than formatted: `toLocaleDateString('en-CA')`
 * happens to render ISO today, and that is a property of ICU rather than a
 * contract.
 */
export function today(now: Date = new Date()): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');

  return `${now.getUTCFullYear()}-${month}-${day}`;
}

/** The `--filter` values: substrings matched against story ids and titles, so
 *  anything is a legal value and only the shape is a contract. A LIST, because
 *  the panel offers the corpus as checkboxes and a reviewer ticks as many as they
 *  mean — `matchesFilter` reads several as a union. Optional, and an empty list is
 *  the same thing as absent: the whole corpus, which is what the gate runs. */
const FilterSchema = z.array(z.string()).optional();

/**
 * What `POST /api/jobs` accepts, per mode. A discriminated union rather than one
 * object with optional fields: a `compare` with no candidate is a refusal at the
 * boundary, not `undefined` three calls deep.
 *
 * TWO, where `JobModeSchema` has four. The other two are readable and not
 * writable — see that schema for why the literals have to survive the tab that
 * produced them.
 */
export const JobRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('compare'),
    baseline: SetLabelSchema,
    candidate: SetLabelSchema,
  }),
  z.object({ mode: z.literal('capture'), label: SetLabelSchema, filter: FilterSchema }),
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
 *
 * `reportId` is the one field that degrades instead of failing, and it is the
 * only one that can afford to. Everywhere else an id enters this app it is
 * checked — `ReportIdSchema` guards every id this app writes — but nothing
 * checked one on the way BACK off disk, so a
 * corrupt or hand-edited row could hand a reader a string that addresses
 * something outside the data directory. Checking it here is where that stops.
 *
 * `.catch(null)` rather than a hard failure, because `readJson` throws the
 * whole file away on a schema miss and `readHistory` is read uncached by the
 * console page: one bad row would otherwise take down the entire console rather
 * than one link. Null is also the honest answer — a report this app cannot
 * address is a report it cannot offer, which is exactly what every reader
 * already does with a run that produced none. The rest of the record keeps the
 * strict all-or-nothing reading, so a genuinely malformed history still says so
 * and names the file.
 */
export const HistoryRecordSchema = z
  .object({
    id: z.string(),
    mode: JobModeSchema,
    label: z.string(),
    startedAt: z.string(),
    endedAt: z.string().nullable(),
    exitCode: z.number().nullable(),
    reportId: ReportIdSchema.nullable().catch(null),
  })
  .strict();

export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;

export const HistorySchema = z.array(HistoryRecordSchema);

/** What the lock file says. `pid` is the whole staleness test: a lock whose
 *  process is gone is a job nobody is running. */
export const LockSchema = z.object({
  pid: z.number(),
  mode: JobModeSchema,
  label: z.string(),
  startedAt: z.string(),
});

export type Lock = z.infer<typeof LockSchema>;

/** What a finished job left for the next request to purge. A list, because a
 *  compare makes three readers stale and a capture two — see `markConsoleStale`
 *  for why the job cannot purge them itself. */
export const RefreshSchema = z.object({ tags: z.array(z.string()) });

/** The D2 hold: a set checked out into a worktree is not the console's to delete. */
const WorktreeSchema = z.object({
  path: z.string(),
  set: z.string(),
  registeredAt: z.string(),
});

export const WorktreesFileSchema = z.object({ worktrees: z.array(WorktreeSchema) });

export type Worktree = z.infer<typeof WorktreeSchema>;

import * as path from 'node:path';

/**
 * The data directory's layout, and the one check that keeps every path inside it.
 *
 * Both halves of this module were written twice before it existed, once on each
 * side of the app, and the containment check is the pair worth naming: lib/jobs.ts
 * had `within()`, which throws, and lib/data.ts had `withinDir()`, which returns
 * null. Same rule, same argument in both doc comments — resolve first, then refuse
 * `..`, an absolute segment, and a sibling that merely shares the base's prefix —
 * and no import between them. `within()`'s own header called it "the one gate every
 * write in this app passes through", which was true of writes and easy to read as
 * true of the app: the read path had its own gate, four lines away from being the
 * same one.
 *
 * Both were correct. That is the point rather than a mitigation — this app IS a
 * gate, a containment bug corrupts the corpus the whole system exists to protect,
 * and two correct implementations of one invariant is the state a drifting pair
 * passes through on its way to being one correct and one not. #357 is the worked
 * example one layer up: four copies of a mutation preamble, three of which kept
 * the host check.
 *
 * A LEAF. No `next/*`, no `node:fs`, no `node:child_process` — nothing but
 * `node:path` and the names below. That is what lets both sides import it: the
 * read path is cached and request-scoped, the write path runs from a detached job,
 * and a module either of them can reach has to be reachable from neither's runtime
 * in particular.
 *
 * WHAT THIS MODULE IS NOT. It does not read, write, or state whether anything
 * exists. `hasReport`/`hasSet` stay in lib/jobs.ts and the readers stay in
 * lib/data.ts; a path builder that touched the disk would give both sides a second
 * opinion about what is there, which is the failure this module exists to retire.
 */

/* ---- The layout ---------------------------------------------------------- */

/**
 * Written out here rather than inlined at each builder, and named here rather
 * than in both callers:
 *
 *     <dir>/sets.json                                    the capture-set registry
 *     <dir>/sets/<label>/<variantKey>.png                one set's shots
 *     <dir>/reports/<id>/summary.json                    one comparison's record
 *     <dir>/reports/<id>/shots/<variantKey>.<kind>.png   what it compared
 *     <dir>/history.json  worktrees.json  refresh.json   the console's own state
 *     <dir>/job.lock  jobs/<jobId>.log                   the run in flight
 *
 * The fixtures under `apps/visual-diff-ui/fixtures/` are this layout, because they
 * are a real run's artifacts rather than a fabrication of one.
 */
const SETS_DIR = 'sets';
const REPORTS_DIR = 'reports';
const SHOTS_DIR = 'shots';
const SETS_FILE = 'sets.json';
const SUMMARY_FILE = 'summary.json';

/* ---- The shapes ---------------------------------------------------------- */

/**
 * A snapshot-set label. No underscore, so `<a>__<b>` splits back into the two
 * labels it names — the same reason `policy.variantKey` can join on `__`.
 */
export const SET_LABEL = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

/**
 * A report id: one directory name, `<setA>__<setB>`.
 *
 * One regex, where there were two identical ones — lib/jobs.ts built
 * `ReportIdSchema` on its copy and lib/data.ts tested its own before opening
 * anything, and jobs.ts's comment said "Matches lib/data.ts's own read-side shape"
 * rather than importing it. An id the console can write has to be an id it can
 * read back, and that is a property of one pattern, not an agreement between two.
 *
 * Checked before `entryUnder` rather than instead of it. Confinement catches the
 * climb; this catches what confinement has no opinion about — a NUL reaches
 * `readFile` as a read error rather than a miss, and answers 500 to a request that
 * deserves a 404.
 */
export const REPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/* ---- The containment check ----------------------------------------------- */

/** A path that would have landed outside the data directory. Thrown, never
 *  returned: an escaped write corrupts the corpus the whole gate protects, so
 *  the only safe answer is to stop rather than to fall back to something. */
export class ConfinementError extends Error {}

/**
 * The rule both wrappers below apply, stated once.
 *
 * On the RESOLVED paths, which is the whole of it: `..` has already been folded
 * away, an absolute segment has already replaced the base, and `<base>-old` no
 * longer looks like a child of `<base>` because the separator is what is being
 * tested for rather than the prefix alone.
 */
const contains = (base: string, target: string): boolean =>
  target === base || target.startsWith(base + path.sep);

/**
 * `path.resolve` under the data directory, and nothing else — the gate every
 * write in this app passes through.
 *
 * Throws rather than returning, because the callers are builders: `setDir(dir,
 * label)` has nowhere to put a null, and a write that quietly did nothing would
 * be worse than one that stopped. Route handlers validate their URL segments and
 * answer 404 long before this; reaching it is a bug, and it says so.
 */
export function within(dataDir: string, ...segments: string[]): string {
  const base = path.resolve(dataDir);
  const target = path.resolve(base, ...segments);

  if (!contains(base, target)) {
    throw new ConfinementError(`${target} is outside the data directory ${base}`);
  }

  return target;
}

/**
 * One entry under `root`, or null for anything that would not be one.
 *
 * The read path's wrapper, and the difference from `within` is deliberate twice
 * over. It answers null because a miss is what the reader wants — a request for a
 * report that is not there is a 404, and a throw would be a 500 on a path whose
 * whole job is to produce the former. And it refuses `target === base`, which
 * `within` allows: `within(dir)` naming the directory itself is how the builders
 * below start, while a URL segment that resolves back to the root ('', '.') names
 * no entry in it.
 */
export function entryUnder(root: string, segment: string): string | null {
  const base = path.resolve(root);
  const target = path.resolve(base, segment);

  return target !== base && contains(base, target) ? target : null;
}

/* ---- The builders -------------------------------------------------------- */

/** The registry naming every set this instance has captured. */
export const setsFilePath = (dataDir: string) => within(dataDir, SETS_FILE);

/** One capture set's shot tree. */
export const setDir = (dataDir: string, label: string) =>
  within(dataDir, SETS_DIR, label);

/** Every capture set, as the root the readers list. Not confined per entry,
 *  because what is read out of it is `readdir`'s own names rather than anything
 *  that arrived in a URL. */
export const setsRoot = (dataDir: string) => within(dataDir, SETS_DIR);

/** One comparison report's directory, for a caller that has already decided the
 *  id is one. Throws on a climb — see `reportDirOf` for the reader's half. */
export const reportDir = (dataDir: string, id: string) =>
  within(dataDir, REPORTS_DIR, id);

/** Every report, as the root the readers list. */
export const reportsRoot = (dataDir: string) => within(dataDir, REPORTS_DIR);

/**
 * One report's directory as a reader asks for it: shape first, then confinement,
 * and null for either refusal.
 *
 * The two answers are deliberately the same one. An id that never existed and an
 * id that climbed out of the data directory are both "no such report" to the
 * caller, because distinguishing them would confirm what is on the disk above it.
 */
export function reportDirOf(dataDir: string, id: string): string | null {
  if (!REPORT_ID.test(id)) return null;

  return entryUnder(reportsRoot(dataDir), id);
}

/** The `summary.json` inside a report directory the caller already holds. */
export const summaryFile = (dir: string) => path.join(dir, SUMMARY_FILE);

/** One shot inside a report directory the caller already holds. `file` arrives
 *  from a URL, so it goes through `entryUnder` rather than a join. */
export const shotUnder = (dir: string, file: string) =>
  entryUnder(path.join(dir, SHOTS_DIR), file);

import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheLife, cacheTag } from 'next/cache';
import { connection } from 'next/server';
import { type DataDirEnv, type DataSource, FIXTURES_DIR, dataDirFrom } from './data-dir';
import { REPORTS_TAG, SETS_TAG, reportTag } from './tags';
// The layout, the shapes and the confinement check. This module had its own copy
// of all three — see lib/paths.ts for what that cost and why it is one now.
import {
  reportDirOf,
  reportsRoot,
  setsFilePath,
  setsRoot,
  shotUnder,
  summaryFile,
} from './paths';
import {
  type Bucket,
  type SetsFile,
  SetsFileSchema,
  type Summary,
  SummarySchema,
} from './summary';
import type { z } from 'zod';

/**
 * The read path: which directory the console reads, and the four readers that
 * read it. Nothing here writes.
 *
 * The layout it reads is lib/paths.ts's, and the fixtures are that layout because
 * they are a real run's artifacts rather than a fabrication of one. Every path
 * below is built by a function from there — including the confinement check that
 * used to live in this file as `withinDir`, beside a second copy in lib/jobs.ts.
 */

// Re-exported rather than moved out of reach: these are the read path's public
// names and every caller already imports them from here.
export { FIXTURES_DIR, type DataDirEnv, type DataSource };

export interface ReportListEntry {
  id: string;
  exitCode: number;
  counts: Record<Bucket, number>;
}

/**
 * Where this instance reads from, resolved per request.
 *
 * `connection()` is what makes it per request. The probe below is synchronous
 * filesystem work, so without it the answer resolves during prerendering — and
 * `next build` runs with `VISUAL_DIFF_DATA_DIR` unset, which would bake "this
 * is sample data" into the static shell of a deployment that has real data.
 *
 * Deliberately NOT called from inside the cached readers: request-time APIs are
 * banned there, and a reader that resolved its own directory would key every
 * caller onto one cache entry. The resolved directory is passed in instead, so
 * it joins the cache key — see the readers below.
 */
export async function resolveDataDir(env: DataDirEnv = process.env): Promise<DataSource> {
  await connection();

  return dataDirFrom(env);
}

type JsonRead = { missing: true } | { missing: false; value: unknown };

/**
 * A file that is not there is not an error — an instance that has captured
 * nothing has no `sets.json` and no reports. A file that is there and cannot be
 * read or parsed is, and says which file it was.
 */
async function readJsonFile(file: string): Promise<JsonRead> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(file, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { missing: true };
    throw new Error(`Could not read ${file}`, { cause });
  }

  try {
    return { missing: false, value: JSON.parse(raw) as unknown };
  } catch (cause) {
    throw new Error(`Could not parse ${file}`, { cause });
  }
}

/** Zod's issue paths, prefixed with the file — the producer changed, and this says where. */
function parseFile<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new Error(`${file} does not match the visual-diff schema: ${issues}`);
}

/** Code-unit order, descending. Report ids lead with their capture-set labels,
 *  which lead with a date, so this is newest-first for every id the CLI writes. */
function newestFirst(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

async function loadSummary(dataDir: string, id: string): Promise<Summary | null> {
  const dir = reportDirOf(dataDir, id);
  if (!dir) return null;

  const file = summaryFile(dir);
  const read = await readJsonFile(file);

  return read.missing ? null : parseFile(SummarySchema, read.value, file);
}

/** The list entry for one report, or `null` for a directory that is not a report
 *  yet: a run writes its shots before its summary, and one half-written run must
 *  not take the whole console down with it. */
async function listEntry(dataDir: string, id: string): Promise<ReportListEntry | null> {
  try {
    const summary = await loadSummary(dataDir, id);
    if (!summary) return null;

    return { id, exitCode: summary.exitCode, counts: summary.counts };
  } catch {
    return null;
  }
}

async function listReportIds(dataDir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(reportsRoot(dataDir), {
      withFileTypes: true,
    });

    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(newestFirst);
  } catch {
    return [];
  }
}

/**
 * The capture sets this instance knows about.
 *
 * `dataDir` is the first argument on every reader here for one reason: `use
 * cache` keys on serialized arguments, so the directory has to BE an argument
 * for two instances (or two e2e worlds off one build) to get different answers.
 * `cacheLife('seconds')` because the CLI writes into this tree while the console
 * is open — a stale list is a run the reviewer cannot see.
 */
export async function readSets(dataDir: string): Promise<SetsFile> {
  'use cache';
  cacheLife('seconds');
  cacheTag(SETS_TAG);

  const file = setsFilePath(dataDir);
  const read = await readJsonFile(file);

  return read.missing ? { sets: [] } : parseFile(SetsFileSchema, read.value, file);
}

/** The bytes one flat set directory holds. A file that has gone away between the
 *  listing and the stat is worth nothing rather than worth a thrown read. */
async function dirBytes(dir: string): Promise<number> {
  const names = await fs.promises.readdir(dir);
  const sizes = await Promise.all(
    names.map(async (name) => {
      try {
        return (await fs.promises.stat(path.join(dir, name))).size;
      } catch {
        return 0;
      }
    }),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

/**
 * What each capture set weighs on disk, by label.
 *
 * Measured rather than recorded: `sets.json` carries no size, and a number
 * written at capture time would go on claiming a set's weight after a human
 * moved half its shots. A label with no entry here has no shot tree in this
 * instance — the registry and the trees are two facts, and the table says
 * "unknown" rather than "0" when it only has one of them.
 *
 * Tagged `SETS_TAG`, like the list these sizes belong to, so one purge retires
 * both. Which mutation can issue that purge is the thing to know: a delete or a
 * prune does it in its own request handler and it lands. A job cannot — it
 * finishes in a detached tail with no request on the stack — so it records what
 * it made stale and `GET /api/jobs/current` purges it on the next poll. See
 * `markConsoleStale` in lib/jobs.ts; a tag purged from anywhere else is a call
 * that silently does nothing.
 */
export async function readSetSizes(dataDir: string): Promise<Record<string, number>> {
  'use cache';
  cacheLife('seconds');
  cacheTag(SETS_TAG);

  const root = setsRoot(dataDir);

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true });
  } catch {
    return {};
  }

  const measured = await Promise.all(
    entries
      // One flat directory of PNGs per set: a file sitting beside them is
      // something a human put there, not a set.
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<[string, number]> => [
        entry.name,
        await dirBytes(path.join(root, entry.name)),
      ]),
  );

  return Object.fromEntries(measured);
}

/** Every report with a readable summary, newest first. */
export async function readReports(dataDir: string): Promise<ReportListEntry[]> {
  'use cache';
  cacheLife('seconds');
  cacheTag(REPORTS_TAG);

  const ids = await listReportIds(dataDir);
  const entries = await Promise.all(ids.map((id) => listEntry(dataDir, id)));

  return entries.filter((entry) => entry !== null);
}

/** One report's `summary.json`, or `null` when no such report exists. Unlike the
 *  list, a malformed summary throws here: the reader asked for this one. */
export async function readReport(dataDir: string, id: string): Promise<Summary | null> {
  'use cache';
  cacheLife('seconds');
  cacheTag(reportTag(id));

  return loadSummary(dataDir, id);
}

/** Shot filenames are `<variantKey>.<kind>.png`, and a variant key is
 *  `[a-z0-9-]` plus `__` separators. Anything with a slash in it is refused
 *  before the resolved-path check ever runs. */
const SHOT_FILE = /^[A-Za-z0-9._-]+\.png$/;

/** The absolute path of one shot, or `null` when the request names anything but
 *  a PNG inside that report's own `shots/` directory. */
export function resolveShotPath(
  dataDir: string,
  reportId: string,
  file: string,
): string | null {
  if (!SHOT_FILE.test(file)) return null;

  const dir = reportDirOf(dataDir, reportId);
  if (!dir) return null;

  return shotUnder(dir, file);
}

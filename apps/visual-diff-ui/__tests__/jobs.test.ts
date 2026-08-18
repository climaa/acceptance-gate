import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { HOST } from '@gate/visual-diff/policy';
import { POST as postJob } from '../app/api/jobs/route';
import { GET as getCurrent } from '../app/api/jobs/current/route';
import {
  HistoryRecordSchema,
  JobRequestSchema,
  WorktreesFileSchema,
  currentJob,
  freeLabel,
  jobLog,
  listSets,
  readHistory,
  readLock,
  recordSet,
  startJob,
  within,
} from '../lib/jobs';
import { NOT_LOCAL } from '../lib/refusals';
import { revalidateTagCalls } from './stubs/next-cache';
import { resetRequestHost, setRequestHost } from './stubs/next-headers';

/**
 * The job system: one job at a time (D1), a log whose last line is the exit
 * code, and a history row per run.
 *
 * Every test runs against a temporary data directory. `startJob` takes its work
 * as an argument, so the lock, the log and the history are exercised without a
 * browser, a Storybook build or a single PNG.
 */

const temporaryDirs: string[] = [];

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-jobs-'));
  temporaryDirs.push(dir);

  return dir;
}

/** A job that ends with the given code, having said one thing about it. */
const workEnding = (exitCode: number, reportId: string | null = null) =>
  vi.fn(async (_dir: string, _request: unknown, log: (line: string) => void) => {
    log('comparing 2 sets');

    return { exitCode, reportId };
  });

const compareRequest = JobRequestSchema.parse({
  mode: 'compare',
  baseline: 'main-2026-08-17',
  candidate: 'main-2026-08-13',
});

/** The lock a dead process would have left behind. PID 1 is alive but not ours;
 *  a PID this far above the kernel's default ceiling is reliably nobody. */
const DEAD_PID = 4_194_305;

function writeStaleLock(dir: string, startedAt: string): void {
  fs.writeFileSync(
    path.join(dir, 'job.lock'),
    JSON.stringify({
      pid: DEAD_PID,
      mode: 'compare',
      label: 'main-2026-08-17__main-2026-08-13',
      startedAt,
    }),
  );
}

/** A job whose end this test controls, so the lock is provably held while a
 *  second request arrives. */
function blockingWork(): { work: () => Promise<{ exitCode: number }>; end: () => void } {
  let end = () => {};
  const finished = new Promise<void>((resolve) => {
    end = resolve;
  });

  return { work: async () => finished.then(() => ({ exitCode: 0 })), end };
}

const jobRequest = (body: unknown) =>
  new Request('http://localhost:3300/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  });

/** The detached tail of a route-started job, waited out so nothing writes into
 *  a directory the next test has already removed. */
async function waitForIdle(dir: string): Promise<void> {
  while (readLock(dir)) await new Promise((resolve) => setTimeout(resolve, 5));
}

afterEach(() => {
  revalidateTagCalls.length = 0;
  resetRequestHost();
  delete process.env.VISUAL_DIFF_DATA_DIR;
  delete process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT;
});

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the pinned seed schemas', () => {
  it('parses the history record the issue pins, verbatim', () => {
    const record = {
      id: '2026-08-17T14-03-22Z-compare',
      mode: 'compare',
      label: 'main-2026-08-17__main-2026-08-13',
      startedAt: '2026-08-17T14:03:22.000Z',
      endedAt: '2026-08-17T14:03:41.000Z',
      exitCode: 1,
      reportId: 'main-2026-08-17__main-2026-08-13',
    };

    expect(HistoryRecordSchema.parse(record)).toEqual(record);
  });

  it('parses a record that is still running, with its three null fields', () => {
    const running = {
      id: '2026-08-17T14-03-22Z-compare',
      mode: 'compare',
      label: 'main-2026-08-17__main-2026-08-13',
      startedAt: '2026-08-17T14:03:22.000Z',
      endedAt: null,
      exitCode: null,
      reportId: null,
    };

    expect(HistoryRecordSchema.parse(running)).toEqual(running);
  });

  it('parses the worktree registry the issue pins, verbatim', () => {
    const registry = {
      worktrees: [
        {
          path: '../acceptance-gate-fix-owl',
          set: 'main-2026-08-11',
          registeredAt: '2026-08-11T09:12:00.000Z',
        },
      ],
    };

    expect(WorktreesFileSchema.parse(registry)).toEqual(registry);
  });

  it('refuses an outcome field on a history record', () => {
    // `outcome` is display-derived from `exitCode` and never stored — a row
    // carrying one would let the console show a verdict its exit code denies.
    const withOutcome = {
      id: '2026-08-17T14-03-22Z-compare',
      mode: 'compare',
      label: 'main-2026-08-17__main-2026-08-13',
      startedAt: '2026-08-17T14:03:22.000Z',
      endedAt: null,
      exitCode: null,
      reportId: null,
      outcome: 'failed',
    };

    expect(HistoryRecordSchema.safeParse(withOutcome).success).toBe(false);
  });
});

describe('startJob', () => {
  it('names the job for the moment it started and the mode it runs', async () => {
    const dir = makeDataDir();

    const outcome = startJob(dir, compareRequest, workEnding(0));

    expect(outcome.ok && outcome.started.job.id).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-compare$/,
    );
    if (outcome.ok) await outcome.started.done;
  });

  it('ends the log with the exit code the job returned', async () => {
    const dir = makeDataDir();
    const outcome = startJob(dir, compareRequest, workEnding(1));
    if (!outcome.ok) throw new Error('the first job must start');

    await outcome.started.done;

    expect(jobLog(dir, outcome.started.job.id).at(-1)).toBe('exit 1');
  });

  it('records the exit code the log ends with on the history row', async () => {
    const dir = makeDataDir();
    const outcome = startJob(dir, compareRequest, workEnding(1, 'a__b'));
    if (!outcome.ok) throw new Error('the first job must start');

    await outcome.started.done;

    const [record] = readHistory(dir);
    expect(record).toMatchObject({ exitCode: 1, reportId: 'a__b' });
    expect(jobLog(dir, record!.id).at(-1)).toBe(`exit ${record!.exitCode}`);
  });

  it('holds the lock while the job runs and releases it when it ends', async () => {
    const dir = makeDataDir();
    const outcome = startJob(dir, compareRequest, workEnding(0));
    if (!outcome.ok) throw new Error('the first job must start');

    expect(readLock(dir)).toMatchObject({ mode: 'compare', pid: process.pid });

    await outcome.started.done;
    expect(readLock(dir)).toBeNull();
  });

  it('refuses a second job while the first holds the lock', async () => {
    const dir = makeDataDir();
    const first = startJob(dir, compareRequest, workEnding(0));

    const second = startJob(dir, compareRequest, workEnding(0));

    expect(second.ok).toBe(false);
    expect(!second.ok && second.running?.mode).toBe('compare');
    if (first.ok) await first.started.done;
  });

  it('records a job that ends in a throw as broken, not as a crash', async () => {
    const dir = makeDataDir();
    const exploding = async () => {
      throw new Error('the set has no shots');
    };
    const outcome = startJob(dir, compareRequest, exploding);
    if (!outcome.ok) throw new Error('the first job must start');

    await outcome.started.done;

    expect(jobLog(dir, outcome.started.job.id)).toEqual([
      'the set has no shots',
      'exit 2',
    ]);
    expect(readHistory(dir)[0]).toMatchObject({ exitCode: 2 });
  });

  it('refreshes both console lists and the report when the job ends', async () => {
    const dir = makeDataDir();
    const outcome = startJob(dir, compareRequest, workEnding(1, 'a__b'));
    if (!outcome.ok) throw new Error('the first job must start');

    await outcome.started.done;

    expect(revalidateTagCalls).toEqual(['vd:sets', 'vd:reports', 'vd:report:a__b']);
  });
});

/** One report's record, as the accept gate reads it. The gate refuses before it
 *  ever opens a shot, so no PNG is seeded here. */
function seedSummary(dir: string, id: string, a11y = 0): void {
  const file = within(dir, 'reports', id, 'summary.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      exitCode: 1,
      thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
      env: { platform: 'linux' },
      counts: { unchanged: 1, changed: 1, added: 0, removed: 0, errored: 0, a11y },
      warnings: [],
      variants: [],
    }),
  );
}

/** A data directory this app is allowed to mutate — `resolveDataDir` reads the
 *  variable, and an empty directory falls back to the committed fixtures. */
function configuredDataDir(): string {
  const dir = makeDataDir();
  fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify({ sets: [] }));
  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

describe('POST /api/jobs', () => {
  it('starts the job and answers with its history row', async () => {
    const dir = configuredDataDir();

    const response = await postJob(
      jobRequest({ mode: 'compare', baseline: 'set-a', candidate: 'set-b' }),
    );

    expect(response.status).toBe(202);
    const body = (await response.json()) as { job: { mode: string } };
    expect(body.job.mode).toBe('compare');
    await waitForIdle(dir);
  });

  it('refuses a second job in the words the console shows', async () => {
    const dir = configuredDataDir();
    const blocking = blockingWork();
    const first = startJob(dir, compareRequest, blocking.work);

    const response = await postJob(
      jobRequest({ mode: 'compare', baseline: 'set-a', candidate: 'set-b' }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('a job is already running');
    blocking.end();
    if (first.ok) await first.started.done;
  });

  it('names the job that is already running, so the console can show it', async () => {
    const dir = configuredDataDir();
    const blocking = blockingWork();
    const first = startJob(dir, compareRequest, blocking.work);

    const response = await postJob(jobRequest({ mode: 'accept', reportId: 'a__b' }));

    const body = (await response.json()) as { job: { label: string } | null };
    expect(body.job?.label).toBe('main-2026-08-17__main-2026-08-13');
    blocking.end();
    if (first.ok) await first.started.done;
  });

  it('answers 400 for a request that names no runnable job', async () => {
    configuredDataDir();

    const response = await postJob(jobRequest({ mode: 'compare', baseline: 'set-a' }));

    expect(response.status).toBe(400);
  });

  // A body nothing could parse is the same refusal as a body that parsed into
  // something this console cannot run: neither names a job, and neither starts.
  it('answers 400 for a body that is not JSON at all', async () => {
    const dir = configuredDataDir();

    const response = await postJob(
      new Request('http://localhost:3300/api/jobs', { method: 'POST', body: 'not json' }),
    );

    expect(response.status).toBe(400);
    expect(readLock(dir)).toBeNull();
  });

  it('refuses every mutation while the console is showing sample data', async () => {
    const response = await postJob(
      jobRequest({ mode: 'compare', baseline: 'set-a', candidate: 'set-b' }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/sample data/);
  });

  // The panel offers no start button off-localhost, but a POST that skips the UI
  // has to meet the same wall — and it has to meet it before the lock, or a
  // deployment could stop a local console from ever starting a job again.
  it('refuses a job asked for by anything but the machine running it', async () => {
    const dir = configuredDataDir();
    setRequestHost('acceptance-gate-visual-diff-ui.vercel.app');

    const response = await postJob(
      jobRequest({ mode: 'compare', baseline: 'set-a', candidate: 'set-b' }),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe(NOT_LOCAL);
    expect(readLock(dir)).toBeNull();
  });
});

describe('the set registry', () => {
  it('lists a recorded set', () => {
    const dir = makeDataDir();

    recordSet(dir, {
      label: 'main-2026-08-17',
      sha: 'f2570e1',
      branch: 'main',
      capturedAt: '2026-08-17',
      stories: 106,
    });

    expect(listSets(dir).map((set) => set.label)).toEqual(['main-2026-08-17']);
  });

  // `listSets` has no way to choose between two rows claiming one label, so a
  // re-registered label replaces its entry rather than appearing twice.
  it('replaces the row a label already had', () => {
    const dir = makeDataDir();
    const set = {
      label: 'main-2026-08-17',
      sha: 'f2570e1',
      branch: 'main',
      capturedAt: '2026-08-17',
      stories: 106,
    };

    recordSet(dir, set);
    recordSet(dir, { ...set, stories: 12 });

    expect(listSets(dir)).toHaveLength(1);
    expect(listSets(dir)[0]?.stories).toBe(12);
  });

  it('hands back the label asked for when nothing holds it', () => {
    const dir = makeDataDir();

    expect(freeLabel(dir, 'main-2026-08-17')).toBe('main-2026-08-17');
  });

  // Counting from 2, and past every suffix already taken: capturing three times
  // in one day is three sets, not one set and two refusals.
  it('counts past every suffix a label has already taken', () => {
    const dir = makeDataDir();
    fs.mkdirSync(path.join(dir, 'sets', 'main-2026-08-17'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sets', 'main-2026-08-17-2'), { recursive: true });

    expect(freeLabel(dir, 'main-2026-08-17')).toBe('main-2026-08-17-3');
  });
});

describe('POST /api/jobs — the accept gate', () => {
  it('refuses an accept from a host that is not the pinned container', async () => {
    const dir = configuredDataDir();
    seedSummary(dir, 'clean-report');

    const response = await postJob(
      jobRequest({ mode: 'accept', reportId: 'clean-report' }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string; recovery: string[] };
    expect(body.error).toContain(HOST.image);
    expect(body.recovery.join(' ')).toContain('git checkout -- __baselines__/');
    expect(readLock(dir)).toBeNull();
  });

  it('refuses an accept while the report carries an accessibility failure', async () => {
    const dir = configuredDataDir();
    process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT = HOST.image;
    seedSummary(dir, 'a11y-report', 1);

    const response = await postJob(
      jobRequest({ mode: 'accept', reportId: 'a11y-report' }),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/accessibility/i);
    expect(readLock(dir)).toBeNull();
  });

  it('answers 404 for an accept of a report that does not exist', async () => {
    configuredDataDir();
    process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT = HOST.image;

    const response = await postJob(jobRequest({ mode: 'accept', reportId: 'never-ran' }));

    expect(response.status).toBe(404);
  });

  it('starts the accept when the host matches and the report is clean', async () => {
    const dir = configuredDataDir();
    process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT = HOST.image;
    seedSummary(dir, 'clean-report');

    const response = await postJob(
      jobRequest({ mode: 'accept', reportId: 'clean-report' }),
    );

    expect(response.status).toBe(202);
    await waitForIdle(dir);
  });
});

describe('GET /api/jobs/current', () => {
  it('is never cached — it is the poll target', async () => {
    configuredDataDir();

    const response = await getCurrent();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('reports the running job and what it has said so far', async () => {
    const dir = configuredDataDir();
    const blocking = blockingWork();
    const first = startJob(dir, compareRequest, async (_dir, _request, log) => {
      log('comparing 2 sets');

      return blocking.work();
    });

    const response = await getCurrent();

    const body = (await response.json()) as { running: boolean; log: string[] };
    expect(body.running).toBe(true);
    expect(body.log).toContain('comparing 2 sets');
    blocking.end();
    if (first.ok) await first.started.done;
  });

  it('reports the last job and its exit line once nothing is running', async () => {
    const dir = configuredDataDir();
    const outcome = startJob(dir, compareRequest, workEnding(1));
    if (!outcome.ok) throw new Error('the first job must start');
    await outcome.started.done;

    const response = await getCurrent();

    const body = (await response.json()) as {
      running: boolean;
      job: { exitCode: number };
      log: string[];
    };
    expect(body.running).toBe(false);
    expect(body.job.exitCode).toBe(1);
    expect(body.log.at(-1)).toBe('exit 1');
  });
});

describe('a stale lock', () => {
  it('leaves the interrupted run in history with no exit code, and admits the next job', async () => {
    const dir = makeDataDir();
    writeStaleLock(dir, '2026-08-17T14:03:22.000Z');

    const outcome = startJob(dir, compareRequest, workEnding(0));

    expect(outcome.ok).toBe(true);
    const interrupted = readHistory(dir).find(
      (record) => record.id === '2026-08-17T14-03-22Z-compare',
    );
    expect(interrupted).toMatchObject({ exitCode: null, endedAt: null });
    if (outcome.ok) await outcome.started.done;
  });

  it('does not report a dead process as the current job', () => {
    const dir = makeDataDir();

    writeStaleLock(dir, '2026-08-17T14:03:22.000Z');

    expect(currentJob(dir)).toBeNull();
  });
});

describe('readHistory', () => {
  // The state a crash mid-rewrite leaves behind, and every later request reads
  // it — so the failure has to name the file rather than a JSON offset.
  it('names the file it could not parse', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'history.json'), '[{');

    expect(() => readHistory(dir)).toThrow(/history\.json/);
  });

  it('names a history file that does not match its schema', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify([{ id: 'no mode' }]));

    expect(() => readHistory(dir)).toThrow(/history\.json/);
  });
});

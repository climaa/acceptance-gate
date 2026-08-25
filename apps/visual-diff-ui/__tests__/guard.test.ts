import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { guardMutation } from '../lib/guard';
import { JOB_RUNNING, NOT_LOCAL, SAMPLE_DATA } from '../lib/refusals';
import { resetRequestHost, setRequestHost } from './stubs/next-headers';

/**
 * The order the mutation guard asks its three questions in.
 *
 * Every one of the three is already asserted through the routes — a sample
 * instance is refused, a remote `Host` is refused, a held lock is refused — and
 * none of those cases pins the ORDER, because each sets up exactly one of the
 * three conditions at a time. Swapping `isSample` and the host check left all
 * 653 tests green, which is what this file is for: the sequence was stated in
 * four route comments and enforced nowhere.
 *
 * It matters because the conditions overlap in production rather than in the
 * suite. A deployment is BOTH serving sample data and reachable from off the
 * machine, always — `next start` sets no data directory — so which sentence it
 * answers with is decided entirely by which question is asked first. Only one of
 * the two is true about what the reviewer is looking at: "there is nothing here
 * to change" describes a console showing this repo's committed fixtures, while
 * "start one from the console on your own machine" tells them to go somewhere
 * else and try again, where the same fixtures and the same refusal are waiting.
 *
 * Tested against `guardMutation` directly rather than through a route: the four
 * handlers now share one implementation, so asserting this four times over would
 * be four copies of a test for one function — the shape the guard itself exists
 * to stop.
 */

const REMOTE = 'visual-diff.example.com';

const temporaryDirs: string[] = [];

/** A data directory that is real but empty of the thing being asked for — enough
 *  for `dataDirFrom` to stop calling it sample data. */
function realDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-guard-'));
  temporaryDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify({ sets: [] }));

  return dir;
}

/** The lock a running job holds, naming this process so it reads as alive. */
function holdLock(dir: string): void {
  fs.writeFileSync(
    path.join(dir, 'job.lock'),
    JSON.stringify({
      pid: process.pid,
      mode: 'compare',
      label: 'main-2026-08-25',
      startedAt: '2026-08-25T10:00:00Z',
    }),
  );
}

const refusalOf = async (gate: Awaited<ReturnType<typeof guardMutation>>) => {
  if (!(gate instanceof Response)) throw new Error('expected a refusal, got a directory');

  return { status: gate.status, error: ((await gate.json()) as { error: string }).error };
};

afterEach(() => {
  resetRequestHost();
  delete process.env.VISUAL_DIFF_DATA_DIR;
  for (const dir of temporaryDirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('guardMutation', () => {
  it('hands a real, idle, local console the directory it may write', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const gate = await guardMutation();

    expect(gate).not.toBeInstanceOf(Response);
    expect(gate).toEqual({ dir });
  });

  // The ordering case. Both conditions hold at once, which is every deployment.
  it('answers a deployed sample console about its data, not about its address', async () => {
    setRequestHost(REMOTE);

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: SAMPLE_DATA,
    });
  });

  it('refuses a real console reached from off the machine', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHost(REMOTE);

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: NOT_LOCAL,
    });
  });

  // The lock is asked about last, so a request that fails an earlier question
  // never reads the disk to find out whether one is held.
  it('refuses a local console while a job holds the directory', async () => {
    const dir = realDataDir();
    holdLock(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: JOB_RUNNING,
    });
  });

  it('says nothing about a held lock to a caller the address already refused', async () => {
    const dir = realDataDir();
    holdLock(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHost(REMOTE);

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_LOCAL);
  });
});

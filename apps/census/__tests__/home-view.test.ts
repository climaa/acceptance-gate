import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadHomeView } from '@/app/home-view.ts';

/**
 * The home's cached view: the files committed in the app's directory, judged
 * against the clock at the moment it runs. Its contract is the two inputs it
 * picks — `process.cwd()` for where the files are, `Date.now()` for "now" —
 * so the test moves both rather than handing them in. The view's own shape is
 * home.test.ts's business; here only what proves which directory and which
 * clock were read.
 *
 * `'use cache'` is inert under vitest and `cacheLife` is the stub in
 * `stubs/next-cache.ts`, so every call reads afresh.
 */

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');
/** The fixture's `measuredAt`: 2026-11-21T18:30:00.000Z. */
const MEASURED_AT = Date.parse('2026-11-21T18:30:00.000Z');
const DAY_MS = 86_400_000;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'census-home-view-'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

function commitFixtures(): void {
  copyFileSync(
    path.join(FIXTURES, 'measurement.json'),
    path.join(dir, 'measurement.json'),
  );
  copyFileSync(path.join(FIXTURES, 'history.json'), path.join(dir, 'history.json'));
}

describe('loadHomeView', () => {
  it('is the empty view when the app directory has nothing committed', async () => {
    vi.setSystemTime(MEASURED_AT);

    const view = await loadHomeView();

    expect(view.state).toBe('empty');
    expect(view.workspaces).toEqual([]);
  });

  it('reads the measurement committed in the app directory', async () => {
    commitFixtures();
    vi.setSystemTime(MEASURED_AT + DAY_MS);

    const view = await loadHomeView();

    expect(view.state).toBe('measured');
    if (view.state !== 'measured') return;
    expect(view.meta.date).toBe('21 Nov 2026');
    expect(view.workspaces.length).toBeGreaterThan(0);
  });

  it('is fresh while the clock is within fourteen days of the measurement', async () => {
    commitFixtures();
    vi.setSystemTime(MEASURED_AT + 14 * DAY_MS);

    const view = await loadHomeView();

    expect(view.state === 'measured' && view.meta.staleDays).toBeNull();
  });

  it('turns stale by the clock alone, with no new measurement', async () => {
    commitFixtures();
    vi.setSystemTime(MEASURED_AT + 20 * DAY_MS);

    const view = await loadHomeView();

    expect(view.state === 'measured' && view.meta.staleDays).toBe(20);
  });

  it('fails, naming the file, when what is committed does not validate', async () => {
    writeFileSync(path.join(dir, 'measurement.json'), '{');
    copyFileSync(path.join(FIXTURES, 'history.json'), path.join(dir, 'history.json'));

    await expect(loadHomeView()).rejects.toThrow(/measurement\.json: not JSON/);
  });
});

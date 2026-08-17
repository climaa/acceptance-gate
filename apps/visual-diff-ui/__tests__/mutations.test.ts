import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { POST as postPrune } from '../app/api/prune/route';
import { DELETE as deleteSet } from '../app/api/sets/[label]/route';
import { JobRequestSchema, startJob } from '../lib/jobs';
import { revalidateTagCalls } from './stubs/next-cache';

/**
 * The two guarded deletions (D2): nothing is deleted implicitly, a held set is
 * refused with the reason, and the console reflects what did happen without a
 * rebuild.
 *
 * The committed fixture tree is digested around the whole file. `resolveDataDir`
 * falls back to it whenever `VISUAL_DIFF_DATA_DIR` is unset — which is exactly
 * the state a deployed sample instance is in — so a mutation that forgot to ask
 * would delete this repo's own files, and this is what would catch it.
 */

const COMMITTED_FIXTURES = path.join(process.cwd(), 'fixtures');
/** The corpus the whole gate exists to protect. Deleting a set must never be
 *  able to reach it, so it is digested here as well as in runner.test.ts. */
const REAL_BASELINES = path.join(
  process.cwd(),
  '..',
  '..',
  'packages',
  'visual-diff',
  '__baselines__',
);

/** The two committed trees no mutation may touch, as one digest. */
const committedTrees = () => `${digest(REAL_BASELINES)}:${digest(COMMITTED_FIXTURES)}`;

const SETS = [
  { label: 'main-2026-08-17', capturedAt: '2026-08-17' },
  { label: 'main-2026-08-15', capturedAt: '2026-08-15' },
  { label: 'main-2026-08-13', capturedAt: '2026-08-13' },
  { label: 'main-2026-08-11', capturedAt: '2026-08-11' },
];

const HELD = 'main-2026-08-11';
const WORKTREE = '../acceptance-gate-fix-owl';

const temporaryDirs: string[] = [];

const context = (label: string) => ({ params: Promise.resolve({ label }) });

const pruneRequest = (body: unknown) =>
  new Request('http://localhost:3300/api/prune', {
    method: 'POST',
    body: JSON.stringify(body),
  });

function digest(dir: string): string {
  const hash = crypto.createHash('sha256');

  for (const name of fs.readdirSync(dir, { recursive: true }).sort()) {
    const file = path.join(dir, String(name));
    hash.update(String(name));
    if (fs.statSync(file).isFile()) hash.update(fs.readFileSync(file));
  }

  return hash.digest('hex');
}

/** A data directory holding four capture sets, the oldest of them held by a
 *  registered worktree. */
function seedDataDir({ held = false } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-mutations-'));
  temporaryDirs.push(dir);

  fs.writeFileSync(
    path.join(dir, 'sets.json'),
    JSON.stringify({
      sets: SETS.map((set) => ({
        ...set,
        sha: 'abc1234',
        branch: 'main',
        stories: 106,
      })),
    }),
  );
  for (const { label } of SETS) {
    fs.mkdirSync(path.join(dir, 'sets', label), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'sets', label, 'atoms__desktop__light__a--b.png'),
      '',
    );
  }
  if (held) {
    fs.writeFileSync(
      path.join(dir, 'worktrees.json'),
      JSON.stringify({
        worktrees: [
          { path: WORKTREE, set: HELD, registeredAt: '2026-08-11T09:12:00.000Z' },
        ],
      }),
    );
  }
  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

/** A job that holds the lock for the rest of the file. Its data directory is a
 *  temporary one, removed with the others when the suite ends. */
const neverEnds = () => new Promise<{ exitCode: number }>(() => {});

const labelsIn = (dir: string) =>
  (
    JSON.parse(fs.readFileSync(path.join(dir, 'sets.json'), 'utf8')) as {
      sets: { label: string }[];
    }
  ).sets.map((set) => set.label);

let committed: string;

beforeAll(() => {
  committed = committedTrees();
});

afterEach(() => {
  revalidateTagCalls.length = 0;
  delete process.env.VISUAL_DIFF_DATA_DIR;
});

afterAll(() => {
  const after = committedTrees();
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });

  expect(after).toBe(committed);
});

describe('DELETE /api/sets/[label]', () => {
  it('removes the set and drops it from the registry', async () => {
    const dir = seedDataDir();

    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context('main-2026-08-15'),
    );

    expect(response.status).toBe(200);
    expect(fs.existsSync(path.join(dir, 'sets', 'main-2026-08-15'))).toBe(false);
    expect(labelsIn(dir)).not.toContain('main-2026-08-15');
  });

  it('refreshes the console list, so the deletion shows without a rebuild', async () => {
    seedDataDir();

    await deleteSet(new Request('http://localhost:3300/'), context('main-2026-08-15'));

    expect(revalidateTagCalls).toContain('vd:sets');
  });

  it('refuses a held set, naming the worktree and the set', async () => {
    const dir = seedDataDir({ held: true });

    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context(HELD),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(WORKTREE);
    expect(body.error).toContain(HELD);
    expect(fs.existsSync(path.join(dir, 'sets', HELD))).toBe(true);
  });

  it('refuses while a job is running', async () => {
    const dir = seedDataDir();
    const running = startJob(
      dir,
      JobRequestSchema.parse({ mode: 'capture', label: 'main-2026-08-17' }),
      neverEnds,
    );

    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context('main-2026-08-15'),
    );

    expect(response.status).toBe(409);
    expect(fs.existsSync(path.join(dir, 'sets', 'main-2026-08-15'))).toBe(true);
    expect(running.ok).toBe(true);
  });

  it('answers 404 for a set that is not there', async () => {
    seedDataDir();

    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context('never-captured'),
    );

    expect(response.status).toBe(404);
  });

  it('answers 404 for a label that climbs out of the data directory', async () => {
    const dir = seedDataDir();

    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context('../../etc'),
    );

    expect(response.status).toBe(404);
    expect(fs.existsSync(path.join(dir, 'sets.json'))).toBe(true);
  });

  it('refuses to touch the committed fixtures a sample instance serves', async () => {
    const response = await deleteSet(
      new Request('http://localhost:3300/'),
      context('main-2026-08-17'),
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/sample data/);
  });
});

describe('POST /api/prune', () => {
  it('keeps the latest n sets and removes the rest', async () => {
    const dir = seedDataDir();

    const response = await postPrune(pruneRequest({ keep: 3 }));

    expect(response.status).toBe(200);
    expect(labelsIn(dir)).toEqual([
      'main-2026-08-17',
      'main-2026-08-15',
      'main-2026-08-13',
    ]);
    expect(fs.existsSync(path.join(dir, 'sets', 'main-2026-08-11'))).toBe(false);
  });

  it('names what it kept and what it removed', async () => {
    seedDataDir();

    const response = await postPrune(pruneRequest({ keep: 3 }));

    const body = (await response.json()) as { kept: string[]; removed: string[] };
    expect(body.kept).toHaveLength(3);
    expect(body.removed).toEqual(['main-2026-08-11']);
  });

  it('skips a held set and says what holds it', async () => {
    const dir = seedDataDir({ held: true });

    const response = await postPrune(pruneRequest({ keep: 2 }));

    const body = (await response.json()) as { removed: string[]; refused: string[] };
    expect(body.removed).toEqual(['main-2026-08-13']);
    expect(body.refused.join(' ')).toContain(WORKTREE);
    expect(fs.existsSync(path.join(dir, 'sets', HELD))).toBe(true);
    expect(labelsIn(dir)).toContain(HELD);
  });

  it('refuses a registry entry that names a path outside the data directory', async () => {
    const dir = seedDataDir();
    const registry = JSON.parse(fs.readFileSync(path.join(dir, 'sets.json'), 'utf8')) as {
      sets: { label: string }[];
    };
    registry.sets.push({ ...registry.sets[0]!, label: '../../escape' });
    fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify(registry));

    const response = await postPrune(pruneRequest({ keep: 1 }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { removed: string[]; refused: string[] };
    expect(body.refused.join(' ')).toContain('../../escape');
    expect(fs.existsSync(path.resolve(dir, '..', '..', 'escape'))).toBe(false);
  });

  it('removes nothing when the instance holds fewer sets than it keeps', async () => {
    const dir = seedDataDir();

    const response = await postPrune(pruneRequest({ keep: 10 }));

    const body = (await response.json()) as { removed: string[] };
    expect(body.removed).toEqual([]);
    expect(labelsIn(dir)).toHaveLength(4);
  });

  it('refuses a keep that is not a whole number of sets', async () => {
    const dir = seedDataDir();

    const response = await postPrune(pruneRequest({ keep: -1 }));

    expect(response.status).toBe(400);
    expect(labelsIn(dir)).toHaveLength(4);
  });

  it('refuses while a job is running', async () => {
    const dir = seedDataDir();
    const running = startJob(
      dir,
      JobRequestSchema.parse({ mode: 'capture', label: 'main-2026-08-17' }),
      neverEnds,
    );

    const response = await postPrune(pruneRequest({ keep: 1 }));

    expect(response.status).toBe(409);
    expect(labelsIn(dir)).toHaveLength(4);
    expect(running.ok).toBe(true);
  });

  it('refuses to touch the committed fixtures a sample instance serves', async () => {
    const response = await postPrune(pruneRequest({ keep: 1 }));

    expect(response.status).toBe(409);
  });
});

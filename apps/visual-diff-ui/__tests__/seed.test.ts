import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { HistoryRecordSchema, WorktreesFileSchema } from '../lib/jobs';
import { SetsFileSchema, SummarySchema } from '../lib/summary';

/**
 * The acceptance suite's seeded worlds, read by the app that has to serve them.
 *
 * `apps/e2e/scripts/seed-visual-diff.mjs` writes the trees the visual-diff
 * scenarios run against. It fabricates states the committed fixture cannot show
 * — a dirty set, a worktree hold, all four outcome words, a removed variant, an
 * accessibility failure — and everything it writes is read back through these
 * schemas by a running console. A seed this app cannot parse has to fail here,
 * in four seconds and with a zod issue path, rather than three scenarios into a
 * browser run with a 500 nobody can place.
 *
 * It lives in this workspace because the schemas do. The script is invoked as a
 * child process rather than imported: it is a `.mjs` in another workspace, and
 * running it is what is under test — not the functions inside it.
 *
 * Note for whoever moves either side: turbo scopes this suite's inputs to this
 * workspace, so an edit to the seed script does NOT invalidate this test's
 * cache. `turbo run test --force`, or a change here, re-runs it.
 */

const SEED_SCRIPT = path.join(
  process.cwd(),
  '..',
  'e2e',
  'scripts',
  'seed-visual-diff.mjs',
);

const REPORT_ID = 'main-2026-08-17__main-2026-08-13';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-seed-'));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** One world, seeded once per set of flags and reused by every case below. */
function world(name: string, ...flags: string[]): string {
  const dir = path.join(root, name);
  if (!fs.existsSync(dir)) execFileSync('node', [SEED_SCRIPT, dir, ...flags]);

  return dir;
}

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;

/** Every file's bytes, by path — what "the same tree" means for a seed that has
 *  to be re-runnable. Timestamps are deliberately not part of it: a re-seed
 *  rewrites the files, and when it happened is not what a scenario reads. */
function treeDigest(dir: string): string {
  const lines: string[] = [];

  const walk = (current: string) => {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name);
      if (fs.statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      const bytes = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      lines.push(`${path.relative(dir, file)}:${bytes}`);
    }
  };
  walk(dir);

  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

describe('the seeded world', () => {
  it('registers sets this app can list', () => {
    const registry = SetsFileSchema.parse(
      readJson(path.join(world('seeded'), 'sets.json')),
    );

    expect(registry.sets.map((set) => set.label)).toEqual([
      'main-2026-08-17',
      'main-2026-08-16',
      'main-2026-08-13',
      'main-2026-08-12',
      'main-2026-08-11',
    ]);
  });

  // The console's dirty badge, and the scenario that reads it off the row.
  it('marks exactly one set as captured from a dirty tree', () => {
    const registry = SetsFileSchema.parse(
      readJson(path.join(world('seeded'), 'sets.json')),
    );

    expect(registry.sets.filter((set) => set.dirty)).toHaveLength(1);
  });

  it('writes a history this app can parse, covering all four outcomes', () => {
    const history = readJson(path.join(world('seeded'), 'history.json'));
    const records = HistoryRecordSchema.array().parse(history);

    expect(records.map((record) => record.exitCode)).toEqual([1, 0, 2, null]);
  });

  it('registers the worktree the refused delete names', () => {
    const registry = WorktreesFileSchema.parse(
      readJson(path.join(world('seeded'), 'worktrees.json')),
    );

    expect(registry.worktrees.map((entry) => entry.set)).toEqual(['main-2026-08-11']);
  });

  it('grafts a report whose counts agree with its variants', () => {
    const file = path.join(world('seeded'), 'reports', REPORT_ID, 'summary.json');
    const summary = SummarySchema.parse(readJson(file));

    const counted = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
    expect(summary.variants.length + summary.counts.unchanged).toBe(counted);
    expect(summary.counts.a11y).toBe(1);
    expect(summary.counts.removed).toBe(1);
  });

  // The report page renders `warnings[]`, and the corpus warning is the strip a
  // reviewer reads before the cards.
  it('carries a warning about an unstable story', () => {
    const file = path.join(world('seeded'), 'reports', REPORT_ID, 'summary.json');
    const summary = SummarySchema.parse(readJson(file));

    expect(summary.warnings.some((warning) => warning.includes('unstable'))).toBe(true);
  });

  // `isSample` is the committed fixture's provenance. This tree is an
  // instance's own data directory, and a report claiming otherwise inside one
  // would be the file disagreeing with the console reading it.
  it('drops the fixture’s sample provenance', () => {
    const file = path.join(world('seeded'), 'reports', REPORT_ID, 'summary.json');
    const summary = SummarySchema.parse(readJson(file));

    expect(summary.isSample).toBeUndefined();
  });

  /** `formatBytes` only reaches "kB" above a thousand bytes, and the listing
   *  scenario asserts kB or MB — a thinner shot tree would render "840 B" and
   *  read as a broken app rather than as a thin seed. */
  it('gives every set a shot tree the console renders in kB', () => {
    const sets = path.join(world('seeded'), 'sets');

    for (const label of fs.readdirSync(sets)) {
      const dir = path.join(sets, label);
      const bytes = fs
        .readdirSync(dir)
        .reduce((total, name) => total + fs.statSync(path.join(dir, name)).size, 0);

      expect(bytes).toBeGreaterThanOrEqual(1_000);
    }
  });
});

describe('the mutating world', () => {
  // Its prune retires the oldest set. A registered worktree would make the
  // server skip that row instead, and the scenario asserts it is gone.
  it('registers no worktree, so nothing survives its prune', () => {
    expect(
      fs.existsSync(path.join(world('mutating', '--mutating'), 'worktrees.json')),
    ).toBe(false);
  });

  it('carries the baselines an accept promotes into, stamped', () => {
    const baselines = path.join(world('mutating', '--mutating'), '__baselines__');
    const stamp = readJson(path.join(baselines, 'BASELINE_ENV.json')) as {
      image: string;
    };

    expect(fs.readdirSync(baselines).filter((name) => name.endsWith('.png')).length).toBe(
      18,
    );
    expect(stamp.image).toBe('mcr.microsoft.com/playwright:v1.62.1-noble');
  });
});

describe('the sample world', () => {
  // An empty data directory is what a deployed instance that has captured
  // nothing looks like: the app falls back to its committed fixtures and badges
  // itself, which is the state the sample scenarios are about.
  it('is an empty directory, so the app falls back to its fixtures', () => {
    expect(fs.readdirSync(world('sample', '--empty'))).toEqual([]);
  });
});

describe('re-seeding', () => {
  // The mutating world is re-seeded on every boot, over the tree the last run
  // wrecked. If that produced a different tree, its scenarios would depend on
  // which run they were.
  it('produces the same tree twice', () => {
    const dir = path.join(root, 'twice');
    execFileSync('node', [SEED_SCRIPT, dir, '--mutating']);
    const first = treeDigest(dir);

    execFileSync('node', [SEED_SCRIPT, dir, '--mutating']);

    expect(treeDigest(dir)).toBe(first);
  });
});

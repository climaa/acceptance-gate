import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ACCEPT_IMAGE } from '../lib/accept-gate';
import { HistoryRecordSchema, WorktreesFileSchema } from '../lib/jobs';
import { promoteBaselines } from '../lib/runner';
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

/** The report the review, a11y and report-suite scenarios read: the one
 *  carrying the fabricated accessibility failure. */
const REPORT_ID = 'main-2026-08-17__main-2026-08-13';

/** The report the accept scenarios promote from. A second report, and a clean
 *  one: `acceptGate` refuses an accessibility failure before it asks anything
 *  else, so the report above can never reach the review gate or the host one —
 *  and those are two of the four acceptance scenarios. */
const ACCEPT_REPORT = 'main-2026-08-17__main-2026-08-16';

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

describe('the accept report', () => {
  const summaryOf = (dir: string): unknown =>
    readJson(path.join(dir, 'reports', ACCEPT_REPORT, 'summary.json'));

  // `acceptGate` asks accessibility first and refuses outright, so a world
  // whose only report carries a violation can never show the review gate or
  // the host one — two of the four acceptance scenarios.
  it('carries no accessibility failure, so the accept gate can be reached', () => {
    const summary = SummarySchema.parse(summaryOf(world('seeded')));

    expect(summary.counts.a11y).toBe(0);
    expect(summary.variants.length).toBeGreaterThan(0);
  });

  it('counts what its variants say', () => {
    const summary = SummarySchema.parse(summaryOf(world('seeded')));
    const counted = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);

    expect(summary.variants.length + summary.counts.unchanged).toBe(counted);
  });

  // `promoteBaselines` reads one candidate shot per reviewable variant before
  // it writes a byte, and refuses the whole accept over a missing one.
  it('has a candidate shot for every variant an accept would promote', () => {
    const dir = path.join(world('mutating', '--mutating'), 'reports', ACCEPT_REPORT);
    const summary = SummarySchema.parse(readJson(path.join(dir, 'summary.json')));

    for (const variant of summary.variants) {
      expect(fs.existsSync(path.join(dir, 'shots', `${variant.key}.candidate.png`))).toBe(
        true,
      );
    }
  });

  // The candidate side IS the B set's shot tree — this report is a comparison
  // of two sets the registry lists, so an accept promotes those very bytes.
  it('takes its candidate shots from the set its id names', () => {
    const dir = world('seeded');
    const summary = SummarySchema.parse(summaryOf(dir));
    const [, candidateSet] = ACCEPT_REPORT.split('__');

    for (const variant of summary.variants) {
      expect(
        fs.readFileSync(
          path.join(
            dir,
            'reports',
            ACCEPT_REPORT,
            'shots',
            `${variant.key}.candidate.png`,
          ),
        ),
      ).toEqual(
        fs.readFileSync(path.join(dir, 'sets', `${candidateSet}`, `${variant.key}.png`)),
      );
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

/**
 * The one scenario whose work is entirely server-side, run here rather than
 * only in a browser: `@mutating` "A matched host accepts the baselines" clicks
 * a button, and everything that happens after that click is this call. A seed
 * that cannot be accepted from fails it as a refusal — which reads as the gate
 * working rather than as a world one shot short.
 */
describe('an accept over the seeded world', () => {
  it('promotes the report’s candidates and restamps the corpus', async () => {
    // Its own world: this writes, and every other case above reads a tree it
    // expects to be the seed's output.
    const dir = world('accepted', '--mutating');
    const log: string[] = [];

    const outcome = await promoteBaselines(dir, ACCEPT_REPORT, (line) => log.push(line), {
      VISUAL_DIFF_FAKE_HOST_FINGERPRINT: ACCEPT_IMAGE,
    });

    expect(outcome.exitCode).toBe(0);
    // The line the live-log assertion waits for.
    expect(log.join('\n')).toContain('BASELINE_ENV.json');
  });

  it('writes the report’s candidate bytes into the baselines', () => {
    const dir = world('accepted', '--mutating');
    const summary = SummarySchema.parse(
      readJson(path.join(dir, 'reports', ACCEPT_REPORT, 'summary.json')),
    );

    for (const variant of summary.variants) {
      expect(
        fs.readFileSync(path.join(dir, '__baselines__', `${variant.key}.png`)),
      ).toEqual(
        fs.readFileSync(
          path.join(
            dir,
            'reports',
            ACCEPT_REPORT,
            'shots',
            `${variant.key}.candidate.png`,
          ),
        ),
      );
    }
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

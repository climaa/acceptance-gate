import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { EXIT, HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_MOUNT, REPO_MOUNT } from '../lib/docker';
import { BASELINE_ENV, CANONICAL_LABEL } from '../lib/baselines';
import { describeCheckout } from '../lib/git';
import { NO_CHECKOUT, STORYBOOK_FAILED } from '../lib/refusals';
import { SummarySchema } from '../lib/summary';
import { compareSets, promoteBaselines, runJob } from '../lib/runner';

/**
 * The runner: comparing two shot trees, and promoting a report's candidates
 * into the data directory's baselines.
 *
 * The shots are the committed fixture's — a real regression captured in the
 * pinned container — laid out as two capture sets. A generated PNG would prove
 * the arithmetic; these prove the pipeline reads what the differ writes.
 *
 * The confinement check runs around the whole file: `packages/visual-diff`'s
 * committed corpus and this app's committed fixtures are digested before the
 * first test and after the last, and a single byte of difference fails the
 * suite. That corpus is what the gate exists to protect, and one escaped write
 * would corrupt it silently.
 */

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const VISUAL_DIFF = path.join(REPO_ROOT, 'packages', 'visual-diff');
const REAL_BASELINES = path.join(VISUAL_DIFF, '__baselines__');
/** The differ's per-run output tree. This app must never be why one appears —
 *  nor why an existing one changes, which is the half a bare existence check
 *  could not see. */
const REAL_ARTIFACTS = path.join(VISUAL_DIFF, '.visual-diff');
const COMMITTED_FIXTURES = path.join(process.cwd(), 'fixtures');
const FIXTURE_REPORT = 'main-2026-08-17__main-2026-08-13';
const FIXTURE_SHOTS = path.join(COMMITTED_FIXTURES, 'reports', FIXTURE_REPORT, 'shots');

const PINNED_ENV = { VISUAL_DIFF_FAKE_HOST_FINGERPRINT: HOST.image };

const temporaryDirs: string[] = [];
const silent = () => {};

/**
 * The budget for a case that really compares pixels.
 *
 * Vitest's default is 5s, which is not a figure anyone here chose — and the four
 * cases below spend 1.8–2.6s of it decoding the committed fixture shots and
 * running pixelmatch over them, on an idle machine. That leaves no headroom, so
 * they failed in CI the first time this app's suite ran beside a busier one: the
 * `test` task builds every package in parallel, and the contention alone was
 * enough. Measured identical on `main`, so the fragility is the default's rather
 * than any one branch's.
 *
 * Raised only for the cases that do the work, never globally. A test that hangs
 * should still fail fast, and the other 570-odd here have no business taking
 * five seconds.
 */
const PIXEL_WORK_MS = 20_000;

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-runner-'));
  temporaryDirs.push(dir);

  return dir;
}

/** Every file under `dir`, as one digest of names and bytes. */
function digest(dir: string): string {
  const hash = crypto.createHash('sha256');

  for (const name of fs.readdirSync(dir, { recursive: true }).sort()) {
    const file = path.join(dir, String(name));
    hash.update(String(name));
    if (fs.statSync(file).isFile()) hash.update(fs.readFileSync(file));
  }

  return hash.digest('hex');
}

/** The fixture's shots of one kind, keyed by variant. */
function fixtureShots(kind: 'baseline' | 'candidate' | 'diff'): Map<string, Buffer> {
  const suffix = `.${kind}.png`;

  return new Map(
    fs
      .readdirSync(FIXTURE_SHOTS)
      .filter((name) => name.endsWith(suffix))
      .map((name) => [
        name.slice(0, -suffix.length),
        fs.readFileSync(path.join(FIXTURE_SHOTS, name)),
      ]),
  );
}

/** A capture set's shot tree: `<dataDir>/sets/<label>/<variantKey>.png`. */
function seedSet(dataDir: string, label: string, shots: ReadonlyMap<string, Buffer>) {
  const dir = path.join(dataDir, 'sets', label);
  fs.mkdirSync(dir, { recursive: true });

  for (const [key, bytes] of shots) fs.writeFileSync(path.join(dir, `${key}.png`), bytes);
}

/** The fixture report, copied under a data directory as a real report would be. */
function seedReport(dataDir: string, id = FIXTURE_REPORT): string {
  const dir = path.join(dataDir, 'reports', id);
  fs.cpSync(path.join(COMMITTED_FIXTURES, 'reports', FIXTURE_REPORT), dir, {
    recursive: true,
  });

  return dir;
}

/** The two committed trees this app must never write into, as one digest. */
const committedTrees = () => `${digest(REAL_BASELINES)}:${digest(COMMITTED_FIXTURES)}`;

/** What a tree that is not there digests as. Distinct from any real digest, so
 *  "there was none" and "there is one now" can never compare equal. */
const ABSENT = 'absent';

/**
 * The differ's artifact tree, as a digest — or {@link ABSENT}.
 *
 * Unlike the two committed trees, this one legitimately may or may not be there
 * before the suite starts: the CLI writes it on every real run, it is gitignored,
 * and a reviewer who ran a capture an hour ago still has one. So it is compared
 * BEFORE against AFTER rather than asserted absent, which is what this check
 * always meant — this app must not be why one appears.
 *
 * Asserted absolutely, it failed on a tree the suite never opened, and reported
 * that as this app writing into the repo. Four times in one session, each time
 * costing a hunt for a defect that was not there; a check that cries wolf is one
 * a reader learns to clear rather than to read.
 */
function artifactTree(): string {
  return fs.existsSync(REAL_ARTIFACTS) ? digest(REAL_ARTIFACTS) : ABSENT;
}

let committed: string;
let artifacts: string;

beforeAll(() => {
  committed = committedTrees();
  artifacts = artifactTree();
});

afterAll(() => {
  const after = committedTrees();
  const artifactsAfter = artifactTree();
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });

  expect(after).toBe(committed);
  // Unchanged, not absent: creating one moves this off `ABSENT`, and writing
  // into one that was already there moves its digest. Both are this app having
  // written where it must not.
  expect(artifactsAfter).toBe(artifacts);
});

describe('compareSets', () => {
  it(
    'writes a report the console can read back',
    async () => {
      const dir = makeDataDir();
      seedSet(dir, 'set-a', fixtureShots('baseline'));
      seedSet(dir, 'set-b', fixtureShots('candidate'));

      const outcome = await compareSets(
        dir,
        { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
        silent,
      );

      expect(outcome).toEqual({ exitCode: 1, reportId: 'set-a__set-b' });
      const summary = SummarySchema.parse(
        JSON.parse(
          fs.readFileSync(
            path.join(dir, 'reports', 'set-a__set-b', 'summary.json'),
            'utf8',
          ),
        ),
      );
      expect(summary.counts.changed).toBe(6);
    },
    PIXEL_WORK_MS,
  );

  it(
    'writes the three shots a reviewer compares, per changed variant',
    async () => {
      const dir = makeDataDir();
      seedSet(dir, 'set-a', fixtureShots('baseline'));
      seedSet(dir, 'set-b', fixtureShots('candidate'));

      await compareSets(
        dir,
        { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
        silent,
      );

      const shots = fs.readdirSync(path.join(dir, 'reports', 'set-a__set-b', 'shots'));
      const key = 'atoms__desktop__light__atoms-prose--default';
      expect(shots).toContain(`${key}.baseline.png`);
      expect(shots).toContain(`${key}.candidate.png`);
      expect(shots).toContain(`${key}.diff.png`);
    },
    PIXEL_WORK_MS,
  );

  it('reports a candidate with no baseline as added, and a baseline with no candidate as removed', async () => {
    const dir = makeDataDir();
    const shots = fixtureShots('candidate');
    const [first, second] = [...shots.keys()];
    seedSet(dir, 'set-a', new Map([[first!, shots.get(first!)!]]));
    seedSet(dir, 'set-b', new Map([[second!, shots.get(second!)!]]));

    await compareSets(
      dir,
      { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
      silent,
    );

    const summary = SummarySchema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(dir, 'reports', 'set-a__set-b', 'summary.json'),
          'utf8',
        ),
      ),
    );
    expect(summary.counts).toMatchObject({ added: 1, removed: 1 });
  });

  it('refuses a set that holds no shots, naming it', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'set-a', fixtureShots('baseline'));

    const refusal = compareSets(
      dir,
      { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
      silent,
    );

    await expect(refusal).rejects.toThrow(/set-b/);
  });

  it(
    'ignores a file whose name is not a variant key, and says so',
    async () => {
      const dir = makeDataDir();
      const lines: string[] = [];
      seedSet(dir, 'set-a', fixtureShots('baseline'));
      seedSet(dir, 'set-b', fixtureShots('candidate'));
      fs.writeFileSync(path.join(dir, 'sets', 'set-b', 'notes.txt'), 'not a shot');

      await compareSets(
        dir,
        { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
        (line) => lines.push(line),
      );

      expect(lines.join('\n')).toContain('notes.txt');
    },
    PIXEL_WORK_MS,
  );
});

describe('compareSets against the committed corpus', () => {
  // The point of offering the corpus at all: a reviewer who has just captured
  // wants to know what their shots did to the corpus CI compares against, not
  // what they did to yesterday's capture.
  //
  // The corpus lives in the CHECKOUT, so this is the one label that resolves
  // outside the data directory. Read-only: the assertions below, and the
  // suite-wide digest around this whole file, are what hold that.
  it(
    'reads the corpus as the baseline side of a compare',
    async () => {
      const dir = makeDataDir();
      seedSet(dir, 'candidate-set', fixtureShots('candidate'));

      const outcome = await compareSets(
        dir,
        { mode: 'compare', baseline: CANONICAL_LABEL, candidate: 'candidate-set' },
        silent,
      );

      expect(outcome.reportId).toBe(`${CANONICAL_LABEL}__candidate-set`);
      const summary = SummarySchema.parse(
        JSON.parse(
          fs.readFileSync(
            path.join(
              dir,
              'reports',
              `${CANONICAL_LABEL}__candidate-set`,
              'summary.json',
            ),
            'utf8',
          ),
        ),
      );
      // Every fixture shot has a baseline in the real corpus, so nothing is `added`
      // — which is what proves the corpus was the tree that was read.
      expect(summary.counts.added).toBe(0);
    },
    PIXEL_WORK_MS,
  );

  // `BASELINE_ENV.json` sits beside the shots. Reporting it as an ignored file
  // every time the corpus is compared would name a file that belongs there.
  it('says nothing about the host stamp beside the shots', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];
    seedSet(dir, 'candidate-set', fixtureShots('candidate'));

    await compareSets(
      dir,
      { mode: 'compare', baseline: CANONICAL_LABEL, candidate: 'candidate-set' },
      (line) => lines.push(line),
    );

    expect(lines.join('\n')).not.toContain(BASELINE_ENV);
  });
});

describe('promoteBaselines', () => {
  it('rewrites the baselines and restamps BASELINE_ENV.json under the data dir', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];
    seedReport(dir);

    const outcome = await promoteBaselines(
      dir,
      FIXTURE_REPORT,
      (line) => lines.push(line),
      PINNED_ENV,
    );

    expect(outcome.exitCode).toBe(0);
    const promoted = fs.readdirSync(path.join(dir, '__baselines__'));
    expect(promoted).toContain('atoms__desktop__light__atoms-prose--default.png');
    expect(promoted).toContain('BASELINE_ENV.json');
    expect(lines.join('\n')).toContain('BASELINE_ENV.json');
  });

  it('stamps the host that promoted, not the one the report was captured on', async () => {
    const dir = makeDataDir();
    seedReport(dir);

    await promoteBaselines(dir, FIXTURE_REPORT, silent, PINNED_ENV);

    const stamp = JSON.parse(
      fs.readFileSync(path.join(dir, '__baselines__', 'BASELINE_ENV.json'), 'utf8'),
    ) as Record<string, string>;
    expect(stamp.image).toBe(HOST.image);
  });

  it('promotes the candidate bytes, not the baseline ones', async () => {
    const dir = makeDataDir();
    seedReport(dir);
    const key = 'atoms__desktop__light__atoms-prose--default';

    await promoteBaselines(dir, FIXTURE_REPORT, silent, PINNED_ENV);

    expect(fs.readFileSync(path.join(dir, '__baselines__', `${key}.png`))).toEqual(
      fs.readFileSync(path.join(FIXTURE_SHOTS, `${key}.candidate.png`)),
    );
  });

  it('refuses a report that still carries an accessibility failure', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];
    const reportDir = seedReport(dir, 'a11y-report');
    const summary = JSON.parse(
      fs.readFileSync(path.join(reportDir, 'summary.json'), 'utf8'),
    ) as { counts: Record<string, number> };
    summary.counts.a11y = 1;
    fs.writeFileSync(path.join(reportDir, 'summary.json'), JSON.stringify(summary));

    const outcome = await promoteBaselines(
      dir,
      'a11y-report',
      (line) => lines.push(line),
      PINNED_ENV,
    );

    expect(outcome.exitCode).toBe(2);
    expect(fs.existsSync(path.join(dir, '__baselines__'))).toBe(false);
    expect(lines.join('\n')).toMatch(/accessibility/i);
  });

  it('refuses when a variant has no candidate shot to promote, writing nothing', async () => {
    const dir = makeDataDir();
    const reportDir = seedReport(dir);
    const key = 'atoms__desktop__light__atoms-prose--default';
    fs.rmSync(path.join(reportDir, 'shots', `${key}.candidate.png`));

    const outcome = await promoteBaselines(dir, FIXTURE_REPORT, silent, PINNED_ENV);

    expect(outcome.exitCode).toBe(2);
    expect(fs.existsSync(path.join(dir, '__baselines__'))).toBe(false);
  });

  it('refuses a report that does not exist', async () => {
    const dir = makeDataDir();

    const outcome = await promoteBaselines(dir, 'never-ran', silent, PINNED_ENV);

    expect(outcome.exitCode).toBe(2);
  });
});

describe('runJob', () => {
  it('routes a compare request to the comparer', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'set-a', fixtureShots('baseline'));
    seedSet(dir, 'set-b', fixtureShots('candidate'));

    const outcome = await runJob(
      dir,
      { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
      silent,
    );

    expect(outcome.reportId).toBe('set-a__set-b');
  });

  it('routes an accept request to the promotion', async () => {
    const dir = makeDataDir();
    seedReport(dir);

    const outcome = await runJob(
      dir,
      { mode: 'accept', reportId: FIXTURE_REPORT },
      silent,
      PINNED_ENV,
    );

    expect(outcome.exitCode).toBe(0);
  });
});

/**
 * The one mode that reaches for a browser, so the one that is spawned rather
 * than composed: the work has to happen inside the pinned image, and what
 * crosses that boundary is argv. What is asserted here is the argv this app
 * composes — the two processes it starts, in order, and the mounts it hands the
 * container. What those processes then do is `scripts/capture-set.mjs` and the
 * differ's own, exercised by a real container run rather than by a mock of one.
 */
describe('runCheck', () => {
  /** Every process `runCheck` started, in order. */
  let started: { command: string; args: string[] }[] = [];
  /** What the next spawn should exit with, shifted per call. */
  let exits: number[] = [];

  beforeEach(() => {
    started = [];
    exits = [];
  });

  /** `child_process.spawn`, replaced for the length of one case: a child that
   *  writes nothing and closes with the code the case queued. */
  async function withSpawn(
    run: (runner: typeof import('../lib/runner')) => Promise<void>,
  ) {
    vi.resetModules();
    // Only `spawn` is faked. `execFileSync` is what `describeCheckout` reads git
    // with, and a stub for it would hand the container a provenance this repo
    // never claimed — which is one of the things these cases assert.
    const real =
      await vi.importActual<typeof import('node:child_process')>('node:child_process');
    vi.doMock('node:child_process', () => ({
      ...real,
      spawn: (command: string, args: string[]) => {
        started.push({ command, args });
        const child = new EventEmitter() as EventEmitter & {
          stdout: Readable;
          stderr: Readable;
        };
        child.stdout = Readable.from([]);
        child.stderr = Readable.from([]);
        queueMicrotask(() => child.emit('close', exits.shift() ?? 0));

        return child;
      },
    }));

    try {
      await run(await import('../lib/runner'));
    } finally {
      vi.doUnmock('node:child_process');
      vi.resetModules();
    }
  }

  const capture = () => started[1];

  // The build first, and every run: "looks stale" is an mtime comparison against
  // every story file, and a capture of a build one commit behind is a report
  // about code nobody is looking at.
  it('builds storybook before it captures', async () => {
    const dir = makeDataDir();

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
    });

    expect(started).toHaveLength(2);
    expect(started[0]).toMatchObject({
      command: 'pnpm',
      args: ['--filter', '@gate/storybook', 'build'],
    });
  });

  // The build writes a line per asset, some two thousand of them, so its output
  // is held back — and released only when it is the thing the reviewer needs.
  it('keeps the build quiet when it succeeds', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, (line) =>
        lines.push(line),
      );
    });

    expect(lines).toContain('building storybook');
    expect(lines.join('\n')).not.toContain('storybook-static/assets');
  });

  // A build that failed leaves nothing to capture against, and the capture never
  // starts — rather than starting and reporting the missing build itself.
  it('does not capture when the build failed', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];
    exits = [1];

    await withSpawn(async ({ runCheck }) => {
      const outcome = await runCheck(
        dir,
        { mode: 'capture', label: 'main-2026-08-17' },
        (line) => lines.push(line),
      );

      expect(outcome.exitCode).toBe(EXIT.broken);
    });

    expect(started).toHaveLength(1);
    expect(lines).toContain(STORYBOOK_FAILED);
  });

  // The whole point of the mode on a developer's machine: `check` guards its
  // host, so the console borrows the image the baselines came from instead of
  // handing over a command to paste.
  it('runs the capture inside the pinned container', async () => {
    const dir = makeDataDir();

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
    });

    expect(capture()?.command).toBe('docker');
    expect(capture()?.args).toContain(HOST.image);
    expect(capture()?.args.join(' ')).toContain(`${REPO_ROOT}:${REPO_MOUNT}`);
    expect(capture()?.args.join(' ')).toContain(`${dir}:${DATA_MOUNT}`);
  });

  // Two mounts, not one: `VISUAL_DIFF_DATA_DIR` may point anywhere, and a path
  // that only works when it happens to sit inside the checkout is a trap that
  // springs the first time it does not.
  it('addresses both directories by their mount, never by their host path', async () => {
    const dir = makeDataDir();

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
    });

    const args = capture()?.args ?? [];
    expect(args[args.indexOf('--root') + 1]).toBe(REPO_MOUNT);
    expect(args[args.indexOf('--data-dir') + 1]).toBe(DATA_MOUNT);
  });

  // `--filter` is the differ's own flag and the run panel spells it verbatim; a
  // field the console shows and the runner drops would be a lie about what it
  // just ran. An empty box is not a filter — `check` reads any filter as "only
  // stories matching this", and the empty string would match nothing.
  // One `--filter` per component the reviewer ticked, which is what the panel now
  // composes and `matchesFilter` reads as a union. Nothing ticked passes no flag:
  // the differ reads an absent filter as the whole corpus.
  it.each([
    [['atoms-button'], ['atoms-button']],
    [
      ['atoms-button', 'molecules-card'],
      ['atoms-button', 'molecules-card'],
    ],
    [[], []],
    [undefined, []],
  ])('passes --filter %j as %j', async (filter, expected) => {
    const dir = makeDataDir();

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17', filter }, silent);
    });

    const args = capture()?.args ?? [];
    const passed = args.filter((_, index) => args[index - 1] === '--filter');
    expect(passed).toEqual(expected);
  });

  // Git is the host's answer: the container has no `.git` worth reading and may
  // have no `git` at all, and a set's provenance is not a thing to guess.
  it('hands the container the checkout git described', async () => {
    const dir = makeDataDir();
    const checkout = describeCheckout(REPO_ROOT);

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
    });

    const args = capture()?.args ?? [];
    expect(args[args.indexOf('--sha') + 1]).toBe(checkout?.sha);
    expect(args[args.indexOf('--branch') + 1]).toBe(checkout?.branch);
    // The third fact git answers, and the one that went unasserted while
    // `capture-set.mjs` read it as a switch and recorded every real capture
    // clean. Asserted as the string the script has to parse, not as a boolean:
    // argv carries no types, and that gap is where the defect lived.
    expect(args[args.indexOf('--dirty') + 1]).toBe(String(checkout?.dirty));
  });

  // Labels are date-shaped, so a second capture on one day asks for a name that
  // is taken. Neither set is lost and neither is overwritten.
  it('suffixes a label this instance has already captured', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'main-2026-08-17', fixtureShots('baseline'));

    await withSpawn(async ({ runCheck }) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
    });

    const args = capture()?.args ?? [];
    expect(args[args.indexOf('--label') + 1]).toBe('main-2026-08-17-2');
  });

  // The belt to the local gate's braces: a console started from outside a
  // checkout has no Storybook to build and no baselines to compare against, and
  // says which is missing rather than starting a build in someone's home
  // directory.
  it('refuses outright when it is not running inside a checkout', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];

    await withSpawn(async ({ runCheck }) => {
      const outcome = await runCheck(
        dir,
        { mode: 'capture', label: 'main-2026-08-17' },
        (line) => lines.push(line),
        os.tmpdir(),
      );

      expect(outcome.exitCode).toBe(EXIT.broken);
    });

    expect(started).toHaveLength(0);
    expect(lines).toContain(NO_CHECKOUT);
  });

  /**
   * The promote's own container decision, asserted as argv rather than by
   * running one.
   *
   * This is what replaced a refusal. Off the pinned image the console used to
   * answer accept with a `docker run` printed for a human to paste, because a
   * promote stamps the machine that wrote it; it now starts that container
   * itself, exactly as a capture does. The case is here rather than beside the
   * other `promoteBaselines` cases because it must NOT spawn a real daemon —
   * a unit suite that pulls an image answers differently on every machine.
   */
  it('wraps the promote in the pinned container off the pinned image', async () => {
    const dir = makeDataDir();
    seedReport(dir);

    await withSpawn(async ({ promoteBaselines }) => {
      await promoteBaselines(dir, FIXTURE_REPORT, silent, {});
    });

    const { command, args } = started[0] ?? { command: '', args: [] };
    expect(command).toBe('docker');
    expect(args).toContain(HOST.image);
    // The data directory is mounted, and the promote is told where it landed.
    // Passing the host's own path would name a directory the container has not
    // got, and omitting it entirely would let `cli.mjs` resolve the COMMITTED
    // corpus from its own location — which is the one write this must never be.
    expect(args[args.indexOf('--data-dir') + 1]).toBe(DATA_MOUNT);
    expect(args[args.indexOf('--report') + 1]).toBe(FIXTURE_REPORT);
    expect(args).toContain('promote');
  });

  // On the pinned image there is nothing to wrap: the same argv, run directly.
  // One implementation, so there is no second code path only the container takes.
  it('promotes directly when it is already on the pinned image', async () => {
    const dir = makeDataDir();
    seedReport(dir);

    await withSpawn(async ({ promoteBaselines }) => {
      await promoteBaselines(dir, FIXTURE_REPORT, silent, PINNED_ENV);
    });

    const { command, args } = started[0] ?? { command: '', args: [] };
    expect(command).toBe(process.execPath);
    expect(args[args.indexOf('--data-dir') + 1]).toBe(dir);
  });
});

describe('confinement', () => {
  it('lands a whole compare-and-accept inside the data dir, leaving the repo untouched', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'set-a', fixtureShots('baseline'));
    seedSet(dir, 'set-b', fixtureShots('candidate'));
    const before = committedTrees();
    const artifactsBefore = artifactTree();

    await compareSets(
      dir,
      { mode: 'compare', baseline: 'set-a', candidate: 'set-b' },
      silent,
    );
    await promoteBaselines(dir, 'set-a__set-b', silent, PINNED_ENV);

    // Both effects are visible, and both are inside the temporary directory:
    // the report the compare wrote and the corpus the accept promoted.
    expect(fs.existsSync(path.join(dir, 'reports', 'set-a__set-b', 'summary.json'))).toBe(
      true,
    );
    expect(fs.readdirSync(path.join(dir, '__baselines__'))).toContain(
      'BASELINE_ENV.json',
    );
    expect(committedTrees()).toBe(before);
    // Unchanged rather than absent, for the reason `artifactTree` gives: the
    // differ's own artifacts are gitignored and a reviewer who ran a capture an
    // hour ago still has some. What this case is about is whether THIS run put
    // anything there.
    expect(artifactTree()).toBe(artifactsBefore);
  });

  it('refuses a set label that climbs out of the data directory', async () => {
    const dir = makeDataDir();

    const escape = compareSets(
      dir,
      { mode: 'compare', baseline: '../../etc', candidate: 'set-b' },
      silent,
    );

    await expect(escape).rejects.toThrow(/outside the data directory/);
  });
});

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EXIT, HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { describeCheckout } from '../lib/git';
import { listSets } from '../lib/jobs';
import { NO_CHECKOUT } from '../lib/refusals';
import { SetSchema, SummarySchema } from '../lib/summary';
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
/** The differ's per-run output tree. This app must never be why one appears. */
const REAL_ARTIFACTS = path.join(VISUAL_DIFF, '.visual-diff');
const COMMITTED_FIXTURES = path.join(process.cwd(), 'fixtures');
const FIXTURE_REPORT = 'main-2026-08-17__main-2026-08-13';
const FIXTURE_SHOTS = path.join(COMMITTED_FIXTURES, 'reports', FIXTURE_REPORT, 'shots');

const PINNED_ENV = { VISUAL_DIFF_FAKE_HOST_FINGERPRINT: HOST.image };

const temporaryDirs: string[] = [];
const silent = () => {};

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

let committed: string;

beforeAll(() => {
  committed = committedTrees();
});

afterAll(() => {
  const after = committedTrees();
  const artifacts = fs.existsSync(REAL_ARTIFACTS);
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });

  expect(after).toBe(committed);
  expect(artifacts).toBe(false);
});

describe('compareSets', () => {
  it('writes a report the console can read back', async () => {
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
  });

  it('writes the three shots a reviewer compares, per changed variant', async () => {
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
  });

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

  it('ignores a file whose name is not a variant key, and says so', async () => {
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

  it('refuses a host that is not the pinned container, writing nothing', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];
    seedReport(dir);

    const outcome = await promoteBaselines(
      dir,
      FIXTURE_REPORT,
      (line) => lines.push(line),
      {},
    );

    expect(outcome.exitCode).toBe(2);
    expect(fs.existsSync(path.join(dir, '__baselines__'))).toBe(false);
    expect(lines.join('\n')).toContain(HOST.image);
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

/** A capture the differ would have handed back, built from the fixture's real
 *  PNGs under its real variant keys — no browser, no Storybook build. */
function capturedShots(
  shots: ReadonlyMap<string, Buffer>,
  bucket: 'captured' | 'errored' = 'captured',
) {
  return [...shots].map(([key, bytes]) => ({ key, bucket, bytes }));
}

/**
 * The one mode that reaches for a browser, so the one that is mocked: a real
 * `check` needs a repo checkout, a Storybook build and the pinned container.
 * What is asserted here is the invocation this app composes, and what it does
 * with the shots on their way past.
 */
describe('runCheck', () => {
  /** `check` and `defaultDeps`, replaced for the length of one case. Modules are
   *  reset around it so every other suite in this file keeps the real ones.
   *
   *  `capture` is the seam under test: `capturing` is whatever `check` was handed,
   *  so a case can drive it exactly as `runCapture` would. */
  async function withMockedCheck(
    run: (
      runCheck: typeof import('../lib/runner').runCheck,
      check: ReturnType<typeof vi.fn>,
    ) => Promise<void>,
    captures: unknown[] = [],
  ) {
    const capture = vi.fn(() => Promise.resolve({ captures, chromium: '141.0.0' }));
    const check = vi.fn((deps: { capture: typeof capture }) => {
      capturing = deps.capture;

      return Promise.resolve({ exitCode: 0, message: 'nothing moved' });
    });
    vi.resetModules();
    vi.doMock('@gate/visual-diff/commands', () => ({
      check,
      defaultDeps: () => ({ capture }),
    }));

    try {
      const { runCheck } = await import('../lib/runner');
      await run(runCheck, check);
    } finally {
      capturing = null;
      vi.doUnmock('@gate/visual-diff/commands');
      vi.resetModules();
    }
  }

  /** The wrapped capture step `check` received, once one has run. */
  let capturing: ((run: { variants: []; baseUrl: string }) => Promise<unknown>) | null =
    null;

  /** Take the shots, the way `runCapture` does — once, with the served build. */
  const takeShots = () => capturing?.({ variants: [], baseUrl: 'http://127.0.0.1:6006' });

  it('runs the differ against the checkout, not against the data directory', async () => {
    const dir = makeDataDir();

    await withMockedCheck(async (runCheck, check) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);

      expect(check).toHaveBeenCalledWith(
        expect.objectContaining({ capture: expect.any(Function) }),
        { rootDir: REPO_ROOT },
      );
    });
  });

  // `--filter` is the CLI's own flag and the run panel spells it verbatim; a
  // field the console shows and the runner drops would be a lie about what it
  // just ran.
  it('passes the story filter the console was given', async () => {
    const dir = makeDataDir();

    await withMockedCheck(async (runCheck, check) => {
      await runCheck(
        dir,
        { mode: 'run', label: 'main-2026-08-17', filter: 'atoms-button' },
        silent,
      );

      expect(check).toHaveBeenCalledWith(expect.anything(), {
        rootDir: REPO_ROOT,
        filter: 'atoms-button',
      });
    });
  });

  // An empty box is not a filter: `check` reads any filter as "only stories
  // matching this", and the empty string would match nothing at all.
  it('passes no filter when none was typed', async () => {
    const dir = makeDataDir();

    await withMockedCheck(async (runCheck, check) => {
      await runCheck(
        dir,
        { mode: 'capture', label: 'main-2026-08-17', filter: '' },
        silent,
      );

      expect(check).toHaveBeenCalledWith(expect.anything(), { rootDir: REPO_ROOT });
    });
  });

  // What the mode is FOR. The differ keeps candidate bytes in memory and writes
  // only its own artifacts, so a capture that did not do this would leave the
  // console with nothing to compare later — which is what `label` used to mean.
  it('writes the shots it took into a set, and registers it', async () => {
    const dir = makeDataDir();
    const shots = fixtureShots('candidate');

    await withMockedCheck(async (runCheck) => {
      await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
      await takeShots();
    }, capturedShots(shots));

    for (const [key, bytes] of shots) {
      expect(
        fs.readFileSync(path.join(dir, 'sets', 'main-2026-08-17', `${key}.png`)),
      ).toEqual(bytes);
    }
    const [set] = listSets(dir);
    expect(SetSchema.parse(set)).toMatchObject({
      label: 'main-2026-08-17',
      stories: shots.size,
      capturedAt: new Date().toISOString().slice(0, 10),
    });
  });

  // The set claims which commit produced the shots, and this console is running
  // inside the checkout that answers.
  it('stamps the set with the checkout it captured from', async () => {
    const dir = makeDataDir();

    await withMockedCheck(
      async (runCheck) => {
        await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
        await takeShots();
      },
      capturedShots(fixtureShots('candidate')),
    );

    const [set] = listSets(dir);
    expect(set?.sha).toBe(describeCheckout(REPO_ROOT)?.sha);
    expect(set?.branch).toBe(describeCheckout(REPO_ROOT)?.branch);
  });

  // An errored variant still carries whatever the page looked like when it
  // failed, and `check`'s own report uses those bytes as the candidate image. A
  // set that dropped them would make the next compare call the story `removed`
  // with nothing to explain it. A variant with no bytes has nothing to write.
  it('keeps an errored shot that has bytes and skips one that has none', async () => {
    const dir = makeDataDir();
    const [kept] = capturedShots(fixtureShots('candidate'), 'errored');
    if (!kept) throw new Error('the committed fixture has no candidate shots');

    await withMockedCheck(
      async (runCheck) => {
        await runCheck(dir, { mode: 'capture', label: 'mixed' }, silent);
        await takeShots();
      },
      [
        kept,
        { key: 'atoms-button--primary.desktop.dark', bucket: 'errored', bytes: null },
      ],
    );

    expect(fs.readdirSync(path.join(dir, 'sets', 'mixed'))).toEqual([`${kept.key}.png`]);
    expect(listSets(dir)[0]?.stories).toBe(1);
  });

  // Labels are date-shaped, so a second capture on one day asks for a name that
  // is taken. Neither set is lost and neither is overwritten.
  it('suffixes a label this instance has already captured', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'main-2026-08-17', fixtureShots('baseline'));

    await withMockedCheck(
      async (runCheck) => {
        await runCheck(dir, { mode: 'capture', label: 'main-2026-08-17' }, silent);
        await takeShots();
      },
      capturedShots(fixtureShots('candidate')),
    );

    expect(listSets(dir).map((set) => set.label)).toEqual(['main-2026-08-17-2']);
    expect(fs.existsSync(path.join(dir, 'sets', 'main-2026-08-17-2'))).toBe(true);
  });

  // The belt to the local gate's braces: a console started from outside a
  // checkout has no Storybook build to serve and no baselines to compare, and
  // says which of those is missing rather than reporting an empty build.
  it('refuses outright when it is not running inside a checkout', async () => {
    const dir = makeDataDir();
    const lines: string[] = [];

    await withMockedCheck(async (runCheck, check) => {
      const outcome = await runCheck(
        dir,
        { mode: 'capture', label: 'main-2026-08-17' },
        (line) => lines.push(line),
        os.tmpdir(),
      );

      expect(outcome.exitCode).toBe(EXIT.broken);
      expect(lines).toContain(NO_CHECKOUT);
      expect(check).not.toHaveBeenCalled();
    });
  });
});

describe('confinement', () => {
  it('lands a whole compare-and-accept inside the data dir, leaving the repo untouched', async () => {
    const dir = makeDataDir();
    seedSet(dir, 'set-a', fixtureShots('baseline'));
    seedSet(dir, 'set-b', fixtureShots('candidate'));
    const before = committedTrees();

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
    expect(fs.existsSync(REAL_ARTIFACTS)).toBe(false);
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

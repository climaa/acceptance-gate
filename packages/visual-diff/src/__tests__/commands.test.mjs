import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { accept, check, defaultDeps, mismatchedHostKeys } from '../commands.mjs';
import { BASELINE_PNG_BUDGET_BYTES, EXIT, HOST, PATHS } from '../policy.mjs';

const ROOT = '/repo';
const at = (relative) => path.join(ROOT, relative);
const INDEX_PATH = at(`${PATHS.storybookStatic}/index.json`);
const baselineAt = (key) => path.join(at(PATHS.baselines), `${key}.png`);

const CHROMIUM = '141.0.0.0';

/** The host the fake baselines were captured on — and, unless a test says otherwise,
 *  the host the fake run is on too. */
const HOST_ENV = {
  platform: 'linux',
  arch: 'x64',
  image: HOST.image,
  playwright: '1.62.1',
};

const STORY = {
  id: 'atoms-button--primary',
  title: 'Atoms/Button',
  type: 'story',
  importPath: 'packages/ui/src/atoms/Button/Button.stories.tsx',
};

/** Atoms are captured at one viewport in both themes, so one story is two variants. */
const KEYS = [
  'atoms__desktop__light__atoms-button--primary',
  'atoms__desktop__dark__atoms-button--primary',
];

const indexJson = (stories = [STORY]) =>
  JSON.stringify({
    v: 6,
    entries: Object.fromEntries(stories.map((story) => [story.id, story])),
  });

/** @param {string} file */
function enoent(file) {
  const error = new Error(`ENOENT: no such file or directory, ${file}`);
  return Object.assign(error, { code: 'ENOENT' });
}

/** A filesystem that is one flat Map of absolute path → contents, recording every write
 *  and every removal so a refusal can be asserted as "nothing was written" rather than
 *  as an exit code alone. */
function fakeFs(files = {}) {
  const store = new Map(Object.entries(files));
  /** @type {Map<string, unknown>} */
  const writes = new Map();
  /** @type {string[]} */
  const removed = [];

  return {
    store,
    writes,
    removed,
    readFile: async (file, encoding) => {
      if (!store.has(file)) throw enoent(file);

      const contents = store.get(file);
      return encoding ? String(contents) : contents;
    },
    writeFile: async (file, data) => {
      writes.set(file, data);
      store.set(file, data);
    },
    mkdir: async () => undefined,
    readdir: async (dir) => {
      const names = [...store.keys()]
        .filter((file) => path.dirname(file) === dir)
        .map((file) => path.basename(file));
      if (names.length === 0) throw enoent(dir);

      return names;
    },
    rm: async (file) => {
      removed.push(file);
      store.delete(file);
    },
  };
}

/** Bytes that differ between themes, so the theme sanity gate sees a live axis. */
const shotFor = (variant) => new TextEncoder().encode(variant.key);

/** A shot of a given weight that still differs between themes — the gates run ahead of
 *  the budgets, and a size test must not trip one of them instead. */
const shotOfBytes = (bytes) => (variant) => {
  const shot = new Uint8Array(bytes);
  shot.set(new TextEncoder().encode(variant.key));

  return shot;
};

const fakeCapture =
  (shot = shotFor, overrides = {}) =>
  async ({ variants }) => ({
    chromium: CHROMIUM,
    captures: variants.map((variant) => ({
      ...variant,
      bucket: 'captured',
      bytes: shot(variant),
      width: 200,
      height: 100,
      violations: [],
      error: null,
      ...overrides,
    })),
  });

/** A `compare.mjs` row, built by hand: the pixel math is that module's own suite, and
 *  the command layer only reads the bucket off the row. */
const row = (key, overrides = {}) => ({
  key,
  id: STORY.id,
  tier: 'atoms',
  viewport: 'desktop',
  theme: key.includes('__dark__') ? 'dark' : 'light',
  bucket: 'unchanged',
  pass: true,
  overlapDiffPixels: 0,
  marginPixels: 0,
  diffPixels: 0,
  allowedDiffPixels: 40,
  width: 200,
  height: 100,
  sizeDelta: null,
  violations: [],
  error: null,
  diff: null,
  ...overrides,
});

const unchangedRows = () => KEYS.map((key) => row(key));

const changedRows = () => [
  row(KEYS[0], {
    bucket: 'changed',
    pass: false,
    overlapDiffPixels: 900,
    diffPixels: 900,
    diff: new Uint8Array([9, 9, 9]),
  }),
  row(KEYS[1]),
];

/** The real command layer with every impure edge replaced: no browser, no socket, no
 *  real filesystem. The pure members — the index reader, the plan, the artifact writer —
 *  are `defaultDeps()`'s own, so the flow under test is the one that ships. */
function deps({
  fs = fakeFs({ [INDEX_PATH]: indexJson() }),
  capture,
  compare,
  host,
} = {}) {
  const served = [];
  const captured = [];
  const compared = [];

  return {
    ...defaultDeps(),
    fs,
    served,
    captured,
    compared,
    serve: async (rootDir) => {
      served.push({ rootDir, open: true });
      const entry = served[served.length - 1];
      return {
        baseUrl: 'http://127.0.0.1:4242',
        close: async () => {
          entry.open = false;
        },
      };
    },
    capture: async (run) => {
      captured.push(run);
      return (capture ?? fakeCapture())(run);
    },
    compare: (run) => {
      compared.push(run);
      return (compare ?? (() => unchangedRows()))(run);
    },
    host: async () => host ?? HOST_ENV,
    env: {},
  };
}

describe('check', () => {
  it('is broken when there is no Storybook build to capture', async () => {
    const gate = deps({ fs: fakeFs() });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('@gate/storybook');
  });

  it('is broken when the build contains no story', async () => {
    const docsOnly = indexJson([{ ...STORY, type: 'docs' }]);
    const gate = deps({ fs: fakeFs({ [INDEX_PATH]: docsOnly }) });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
  });

  it('is broken when --filter matches no story, rather than passing on an empty run', async () => {
    const gate = deps();

    const result = await check(gate, { rootDir: ROOT, filter: 'no-such-story' });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('no-such-story');
  });

  it('is broken when the theme sanity gate trips', async () => {
    const oneShotForEveryTheme = () => new Uint8Array([1, 2, 3]);
    const gate = deps({ capture: fakeCapture(oneShotForEveryTheme) });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('theme');
  });

  it('exits clean when every variant is unchanged', async () => {
    const gate = deps();

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.ok);
  });

  it('exits 1 when a variant changed', async () => {
    const gate = deps({ compare: () => changedRows() });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.diff);
  });

  it('narrows the capture plan to the stories --filter names', async () => {
    const two = indexJson([
      STORY,
      { ...STORY, id: 'atoms-badge--default', title: 'Atoms/Badge' },
    ]);
    const gate = deps({ fs: fakeFs({ [INDEX_PATH]: two }) });

    await check(gate, { rootDir: ROOT, filter: 'badge' });

    const ids = new Set(gate.captured[0].variants.map((variant) => variant.id));
    expect([...ids]).toEqual(['atoms-badge--default']);
  });

  it('compares a filtered run only against the baselines that run covers', async () => {
    // Without this, `--filter button` reports every other committed baseline as
    // `removed` and exits 1 — a narrowed run failing over the stories it deliberately
    // did not capture.
    const outsider = 'atoms__desktop__light__atoms-badge--default';
    const fs = fakeFs({
      [INDEX_PATH]: indexJson(),
      [baselineAt(KEYS[0])]: new Uint8Array([1]),
      [baselineAt(outsider)]: new Uint8Array([2]),
    });
    const gate = deps({ fs });

    await check(gate, { rootDir: ROOT, filter: 'button' });

    expect([...gate.compared[0].baselines.keys()]).toEqual([KEYS[0]]);
  });

  it('lists the stories held back by the skip tag rather than hiding the hole', async () => {
    const skipped = {
      ...STORY,
      id: 'atoms-spinner--default',
      tags: ['visual-diff:skip'],
    };
    const gate = deps({ fs: fakeFs({ [INDEX_PATH]: indexJson([STORY, skipped]) }) });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.summary.warnings.join(' ')).toContain('atoms-spinner--default');
  });

  it('is broken when every story the run covers is skipped', async () => {
    const skipped = { ...STORY, tags: ['visual-diff:skip'] };
    const gate = deps({ fs: fakeFs({ [INDEX_PATH]: indexJson([skipped]) }) });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
  });

  it('writes summary.json, summary.md, report.html and one PNG per failing variant', async () => {
    const gate = deps({ compare: () => changedRows() });

    await check(gate, { rootDir: ROOT });

    expect([...gate.fs.writes.keys()]).toEqual([
      at(PATHS.summaryJson),
      at(PATHS.summaryMd),
      at(PATHS.reportHtml),
      path.join(at(PATHS.diffs), `${KEYS[0]}.png`),
    ]);
  });

  it('records the host and the browser the shots were actually taken with', async () => {
    const gate = deps();

    const { summary } = await check(gate, { rootDir: ROOT });

    expect(summary.env).toEqual({ ...HOST_ENV, chromium: CHROMIUM });
  });

  it('closes the static server even when the capture throws', async () => {
    const gate = deps({
      capture: async () => {
        throw new Error('the browser died mid-run');
      },
    });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(gate.served[0].open).toBe(false);
  });
});

describe('check host guard', () => {
  const otherHost = { ...HOST_ENV, platform: 'darwin' };

  const withBaselines = (env = HOST_ENV) =>
    fakeFs({
      [INDEX_PATH]: indexJson(),
      [at(PATHS.baselineEnv)]: JSON.stringify(env),
      [baselineAt(KEYS[0])]: new Uint8Array([1]),
      [baselineAt(KEYS[1])]: new Uint8Array([2]),
    });

  it('refuses to compare against baselines captured on another host', async () => {
    const gate = deps({ fs: withBaselines(otherHost) });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('darwin');
  });

  it('still exits 1 on a mismatched host once the mismatch is allowed', async () => {
    // The whole point of the flag: it downgrades the mismatch, never the verdict. An
    // unconditional 0 here would turn the gate off for every CI run carrying the
    // environment variable.
    const gate = deps({ fs: withBaselines(otherHost), compare: () => changedRows() });

    const result = await check(gate, { rootDir: ROOT, allowHostMismatch: true });

    expect(result.exitCode).toBe(EXIT.diff);
  });

  it('exits 0 with an advisory warning when the allowed mismatch found no diff', async () => {
    const gate = deps({ fs: withBaselines(otherHost) });

    const result = await check(gate, { rootDir: ROOT, allowHostMismatch: true });

    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.summary.warnings.join(' ')).toContain('darwin');
  });

  it('reads the same permission out of the environment turbo forwards', async () => {
    const gate = deps({ fs: withBaselines(otherHost) });
    gate.env = { VISUAL_DIFF_ALLOW_HOST_MISMATCH: '1' };

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.ok);
  });

  it('takes VISUAL_DIFF_ALLOW_HOST_MISMATCH literally, never as truthiness', async () => {
    const gate = deps({ fs: withBaselines(otherHost) });
    gate.env = { VISUAL_DIFF_ALLOW_HOST_MISMATCH: 'false' };

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
  });

  it('warns rather than blocks when committed baselines record no host at all', async () => {
    const fs = withBaselines();
    fs.store.delete(at(PATHS.baselineEnv));
    const gate = deps({ fs });

    const result = await check(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.summary.warnings.join(' ')).toContain('BASELINE_ENV.json');
  });

  it('says nothing about the host on a first run, with no baselines to compare to', async () => {
    const gate = deps();

    const result = await check(gate, { rootDir: ROOT });

    expect(result.summary.warnings).toEqual([]);
  });
});

describe('mismatchedHostKeys', () => {
  it('names every field of the stamp that disagrees', () => {
    const mismatched = mismatchedHostKeys(
      { ...HOST_ENV, arch: 'arm64', playwright: '1.61.0' },
      HOST_ENV,
    );

    expect(mismatched).toEqual(['arch', 'playwright']);
  });

  it('treats an unrecorded field as a mismatch — a stamp that omits it proves nothing', () => {
    const { platform: _dropped, ...partial } = HOST_ENV;

    expect(mismatchedHostKeys(partial, HOST_ENV)).toEqual(['platform']);
  });

  it('ignores the browser build, which the compared image already pins', () => {
    const recorded = { ...HOST_ENV, chromium: '140.0.0.0' };

    expect(mismatchedHostKeys(recorded, { ...HOST_ENV, chromium: CHROMIUM })).toEqual([]);
  });
});

describe('accept', () => {
  const withOrphan = () =>
    fakeFs({
      [INDEX_PATH]: indexJson(),
      [baselineAt(KEYS[0])]: new Uint8Array([1]),
      [baselineAt('atoms__desktop__light__atoms-retired--story')]: new Uint8Array([2]),
    });

  it('writes one baseline per captured variant', async () => {
    const gate = deps();

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.ok);
    expect(result.written).toEqual(KEYS);
  });

  it('prunes a baseline no story claims any more', async () => {
    const gate = deps({ fs: withOrphan() });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.pruned).toEqual(['atoms__desktop__light__atoms-retired--story']);
    expect(gate.fs.removed).toEqual([
      baselineAt('atoms__desktop__light__atoms-retired--story'),
    ]);
  });

  it('prunes nothing under --filter, which only ever covers part of the corpus', async () => {
    const gate = deps({ fs: withOrphan() });

    const result = await accept(gate, { rootDir: ROOT, filter: 'button' });

    expect(result.pruned).toEqual([]);
    expect(gate.fs.removed).toEqual([]);
  });

  it('restamps BASELINE_ENV.json with the host and browser that captured', async () => {
    const gate = deps();

    await accept(gate, { rootDir: ROOT });

    expect(JSON.parse(String(gate.fs.writes.get(at(PATHS.baselineEnv))))).toEqual({
      ...HOST_ENV,
      chromium: CHROMIUM,
    });
  });

  it('refuses, writing nothing, when one PNG is over the per-file budget', async () => {
    const gate = deps({
      capture: fakeCapture(shotOfBytes(BASELINE_PNG_BUDGET_BYTES + 1)),
    });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain(KEYS[0]);
    expect(gate.fs.writes.size).toBe(0);
  });

  it('refuses, writing nothing, when the corpus is over budget', async () => {
    // Every PNG is under the per-file cap: it is the set that does not fit, which is
    // the failure the corpus budget exists for.
    const stories = Array.from({ length: 6 }, (_, index) => ({
      ...STORY,
      id: `atoms-button--variant-${index}`,
    }));
    const gate = deps({
      fs: fakeFs({ [INDEX_PATH]: indexJson(stories) }),
      capture: fakeCapture(shotOfBytes(BASELINE_PNG_BUDGET_BYTES)),
    });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('budget');
    expect(gate.fs.writes.size).toBe(0);
  });

  it('refuses, writing nothing, when a variant failed to capture', async () => {
    const gate = deps({
      capture: fakeCapture(shotFor, { bucket: 'errored', error: 'story never rendered' }),
    });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(gate.fs.writes.size).toBe(0);
  });

  it('leaves the committed baselines untouched when the capture itself throws', async () => {
    const gate = deps({
      fs: withOrphan(),
      capture: async () => {
        throw new Error('the browser died mid-run');
      },
    });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(gate.fs.writes.size).toBe(0);
    expect(gate.fs.removed).toEqual([]);
  });

  it('refuses, writing nothing, when a sanity gate proves the run blind', async () => {
    const oneShotForEveryTheme = () => new Uint8Array([1, 2, 3]);
    const gate = deps({ capture: fakeCapture(oneShotForEveryTheme) });

    const result = await accept(gate, { rootDir: ROOT });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(gate.fs.writes.size).toBe(0);
  });
});

/**
 * How long the run took.
 *
 * The artifact recorded counts, thresholds and env, and nothing about elapsed time — so
 * a capture that got 50% slower wrote a byte-identical `summary.json` and no reader
 * could see it. The nightly determinism job captures the whole corpus twice and had no
 * way to say which half was slow.
 *
 * Attached by `check`, not by `buildSummary`: the console composes that function itself
 * for its own compare mode, through a hand-written declaration, and widening its
 * signature would ripple into another workspace to no purpose here.
 *
 * The clock is STUBBED here rather than measured. Against the fake filesystem every
 * phase completes inside a millisecond and rounds to zero, so an assertion like
 * "the total is at least the sum of its parts" holds no matter what the code does —
 * a version returning a hardcoded `totalMs: 0` passed it. Feeding a known sequence is
 * what makes the arithmetic checkable at all.
 */
describe('the timing a run records', () => {
  /** Readings in the order `check` takes them: start, after capture, after compare,
   *  and the total's own read at the end. */
  const clock = (...readings) => {
    const queue = [...readings];
    return vi
      .spyOn(performance, 'now')
      .mockImplementation(() => queue.shift() ?? readings[readings.length - 1]);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports each phase as the span it actually took', async () => {
    clock(1000, 1700, 1750, 1800);

    const { summary } = await check(deps(), { rootDir: ROOT });

    expect(summary.timing).toEqual({ captureMs: 700, compareMs: 50, totalMs: 800 });
  });

  /** The total is the run's own span, not a third independent reading — a total that
   *  could come in under its own parts would make comparing two runs unreadable. */
  it('covers both phases with the total', async () => {
    clock(0, 400, 900, 1000);

    const { timing } = (await check(deps(), { rootDir: ROOT })).summary;

    expect(timing.totalMs).toBeGreaterThanOrEqual(timing.captureMs + timing.compareMs);
  });

  it('reports three whole numbers of milliseconds on a real clock', async () => {
    const { timing } = (await check(deps(), { rootDir: ROOT })).summary;

    for (const span of [timing.captureMs, timing.compareMs, timing.totalMs]) {
      expect(Number.isInteger(span)).toBe(true);
      expect(span).toBeGreaterThanOrEqual(0);
    }
  });

  /** Optional by design — see the `SummaryTiming` typedef. `schemaVersion` stays 1
   *  because a reader that has never heard of the field parses the file unchanged. */
  it('adds the field without bumping the schema every reader checks', async () => {
    const { summary } = await check(deps(), { rootDir: ROOT });

    expect(summary.schemaVersion).toBe(1);
  });
});

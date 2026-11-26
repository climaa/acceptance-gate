import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

/**
 * `pnpm census:measure`: the script that spawns every suite, fallow and a
 * Storybook build, reads what they leave behind, and writes measurement.json and
 * history.json. Everything it decides lives in `lib/`, which has its own tests;
 * what is left here is the wiring: which command runs where with which flags,
 * which file is read into which dimension, when it refuses, and that it writes
 * nothing when a file fails validation.
 *
 * So the disk (`node:fs`), git and the spawned tools (`node:child_process`) are
 * an in-memory repository, and every `lib/` module is a stand-in that returns a
 * marker the assertions can trace. Nothing is spawned and nothing is written.
 */
const { fake, libs } = vi.hoisted(() => {
  /** Absolute path → contents. A directory exists when some file sits under it. */
  const files = new Map<string, string>();
  return {
    fake: {
      files,
      /** What it wrote into the workspace: the two committed files, never its `.census/` scratch. */
      written: new Map<string, string>(),
      git: { dirty: '', listed: {} as Record<string, string[]> },
      /** Per-command overrides: `spawnSync` answers through this. */
      spawn: vi.fn(),
    },
    libs: {
      testedAsProcess: vi.fn((_texts: string[], _code: string[]) => new Set<string>()),
      unmappedFeatures: vi.fn((_names: string[]): string[] => []),
      validateMeasurement: vi.fn((_m: unknown): string[] => []),
      validateHistory: vi.fn((_h: unknown): string[] => []),
      historyPoint: vi.fn((_m: unknown, extra: unknown) => ({ point: extra })),
      withPoint: vi.fn((history: { points: unknown[] } | undefined, point: unknown) => ({
        points: [...(history?.points ?? []), point],
      })),
      codeValue: vi.fn((_summary: unknown, _dir: string, opts: unknown) => ({
        dimension: 'code',
        state: 'measured',
        opts,
      })),
    },
  };
});

vi.mock('node:fs', () => {
  const under = (dir: string) =>
    [...fake.files.keys()].filter((k) => k.startsWith(`${dir}/`));
  return {
    existsSync: (p: string) => fake.files.has(p) || under(p).length > 0,
    readFileSync: (p: string) => {
      const text = fake.files.get(p);
      if (text === undefined) throw new Error(`ENOENT: ${p}`);
      return text;
    },
    readdirSync: (p: string) => under(p).map((k) => k.slice(p.length + 1)),
    rmSync: (p: string) => under(p).forEach((k) => fake.files.delete(k)),
    mkdirSync: () => undefined,
    writeFileSync: (p: string, text: string) => {
      fake.files.set(p, text);
      if (p.includes('/apps/census/')) fake.written.set(p, text);
    },
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: (_cmd: string, args: string[]) => {
    if (args[0] === 'rev-parse') return 'abc1234def\n';
    if (args[0] === 'status') return fake.git.dirty;
    const asked = args.slice(args.indexOf('--') + 1);
    return asked.flatMap((p) => fake.git.listed[p] ?? []).join('\n');
  },
  spawnSync: (...call: unknown[]) => fake.spawn(...call),
}));

vi.mock('../lib/assemble.ts', () => ({
  PSEUDO_WORKSPACES: [{ name: 'scripts/', path: 'scripts' }],
  categoryOf: (p: string) => (p.startsWith('apps/') ? 'apps' : 'other'),
  gapCounts: () => ({ 'uncovered-file': 1 }),
  gapDiff: () => ({ opened: ['opened-gap'], closed: ['closed-gap'] }),
  historyPoint: libs.historyPoint,
  visualHeadline: () => 'visual-headline',
  withPoint: libs.withPoint,
}));
vi.mock('../lib/collect/acceptance.ts', () => ({
  acceptanceValues: () => ({
    'apps/census': { dimension: 'acceptance', state: 'measured' },
  }),
  countScenarios: (source: string) => Number(source),
}));
vi.mock('../lib/collect/code.ts', () => ({
  codeValue: libs.codeValue,
  hasCoverageBlock: (source: string) => source.includes('coverage'),
  linesFloor: (source: string) => (source.includes('floor') ? 70 : undefined),
}));
vi.mock('../lib/collect/health.ts', () => ({
  fileFacts: () => ({ facts: true }),
  repositoryHealth: () => ({ score: 90 }),
  workspaceHealth: () => ({ dimension: 'health' }),
}));
vi.mock('../lib/collect/process.ts', () => ({
  inWorkspace: () => ['as-process'],
  testedAsProcess: libs.testedAsProcess,
}));
vi.mock('../lib/collect/routes.ts', () => ({
  routeStates: (files: string[]) => (files.includes('page.tsx') ? [{ route: '/' }] : []),
  routeSummary: () => ({ routes: 1 }),
}));
vi.mock('../lib/collect/visual.ts', () => ({
  appComponents: () => [],
  appModules: () => [],
  appVisual: (wsPath: string, inputs: { routes?: unknown }) => ({
    value: { dimension: 'visual', state: 'app', wsPath, routes: inputs.routes ?? null },
    unstoried: [],
  }),
  indexStories: (index: { stories: unknown[] }) => index.stories,
  storyIdsOf: (keys: string[]) => new Set(keys),
  storyImports: () => [],
  storyParts: () => [],
  uiVisual: () => ({ value: { dimension: 'visual', state: 'ui' }, unstoried: [] }),
}));
vi.mock('../lib/features.ts', () => ({
  APP_WORKSPACES: { storybook: 'apps/storybook' },
  featureName: (file: string) => path.basename(file, '.feature'),
  unmappedFeatures: libs.unmappedFeatures,
}));
vi.mock('../lib/gaps.ts', () => ({ deriveGaps: () => [{ id: 'the-gap' }] }));
vi.mock('../lib/validate.ts', () => ({
  validateMeasurement: libs.validateMeasurement,
  validateHistory: libs.validateHistory,
}));

const SCRIPT = '../scripts/measure.mjs';
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const at = (p: string) => path.join(ROOT, p);
const OUT = at('.census');
const MEASUREMENT = at('apps/census/measurement.json');
const HISTORY = at('apps/census/history.json');

type Workspace = { path: string; dimensions: Record<string, { state: string }> };
type Measurement = {
  commit: string;
  tools: Record<string, string>;
  pyramid: Record<string, number>;
  health: unknown;
  workspaces: Workspace[];
  gaps: unknown[];
};

/** What `fallow … --format json` prints: one report shape answers every call. */
const FALLOW_REPORT = {
  groups: [{ key: 'apps', health_score: { score: 80, grade: 'B', penalties: {} } }],
  findings: [{ cognitive: 25 }, { cognitive: 5 }],
  vital_signs: { duplication_pct: 1.5 },
};

/**
 * A small repository: census (measured, with an app route), storybook (no vitest
 * config), e2e (a config with no coverage block), an empty app, packages/ui
 * (whose coverage run writes no summary) and the shared-config `scripts/`.
 */
function seedRepository() {
  const json = (p: string, value: unknown) =>
    fake.files.set(at(p), JSON.stringify(value));
  for (const name of ['census', 'storybook', 'e2e', 'blank'])
    json(`apps/${name}/package.json`, { name: `@gate/${name}` });
  json('packages/ui/package.json', { name: '@gate/ui' });
  fake.files.set(at('apps/census/vitest.config.mts'), 'coverage');
  fake.files.set(at('apps/e2e/vitest.config.ts'), 'no block');
  fake.files.set(at('packages/ui/vitest.config.mts'), 'coverage');
  fake.files.set(at('vitest.sandcastle.config.mts'), 'coverage floor');
  json('apps/census/node_modules/vitest/package.json', { version: '5.0.5' });
  json('apps/storybook/node_modules/storybook/package.json', { version: '10.0.0' });
  json('apps/storybook/storybook-static/index.json', { stories: [] });
  json('designs/exports/census.tiles.json', { tiles: { 'census--home': {} } });
  json('apps/census/measurement.json', { gaps: [] });
  fake.files.set(at('apps/e2e/features/acceptance/census.feature'), '2');
  fake.files.set(at('apps/e2e/features/smoke.feature'), '5');
  for (const file of [
    'apps/census/app/page.tsx',
    'apps/census/components/Frame.tsx',
    'apps/census/lib/a.ts',
    'apps/census/app/_screens/home.stories.tsx',
    'apps/e2e/steps.ts',
    'apps/e2e/support/Fixture.tsx',
  ])
    fake.files.set(at(file), '');

  fake.git.listed = {
    'apps/*/package.json': [
      'apps/census/package.json',
      'apps/storybook/package.json',
      'apps/e2e/package.json',
      'apps/blank/package.json',
    ],
    'packages/*/package.json': ['packages/ui/package.json'],
    '.': ['apps/census/lib/a.ts', 'README.md'],
    'apps/e2e/features/**/*.feature': [
      'apps/e2e/features/acceptance/census.feature',
      'apps/e2e/features/smoke.feature',
    ],
    'designs/exports/*.tiles.json': ['designs/exports/census.tiles.json'],
    'packages/visual-diff/__baselines__': [
      'packages/visual-diff/__baselines__/census--home.png',
      'packages/visual-diff/__baselines__/README.md',
    ],
    '*.stories.tsx': ['apps/census/app/_screens/home.stories.tsx'],
    'apps/census': [
      'apps/census/app/page.tsx',
      'apps/census/components/Frame.tsx',
      'apps/census/lib/a.ts',
      'apps/census/vitest.config.mts',
    ],
    'apps/census/app': ['apps/census/app/page.tsx'],
    'apps/storybook': ['apps/storybook/main.ts'],
    'apps/e2e': ['apps/e2e/steps.ts', 'apps/e2e/support/Fixture.tsx'],
    'packages/ui': ['packages/ui/src/Button.tsx'],
    scripts: ['scripts/gate.mjs'],
  };
}

const flag = (args: string[], name: string) =>
  args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);

/** The tools as they behave on a green tree: vitest leaves its reports, fallow prints JSON. */
function spawnTools(
  command: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string> },
) {
  if (command === 'npx')
    return { status: 1, stdout: JSON.stringify(FALLOW_REPORT), stderr: '' };
  if (args[0] !== 'exec') return { status: 0, stdout: '', stderr: '' };
  fake.files.set(flag(args, '--outputFile')!, JSON.stringify({ numTotalTests: 3 }));
  const reports = flag(args, '--coverage.reportsDirectory');
  if (reports) {
    fake.files.set(
      path.join(reports, 'coverage-final.json'),
      JSON.stringify({ [reports]: {} }),
    );
    if (opts.cwd !== at('packages/ui'))
      fake.files.set(path.join(reports, 'coverage-summary.json'), '{}');
  }
  // Where the script told the suite's child processes to leave their V8 coverage.
  const children = opts.env.NODE_V8_COVERAGE ?? '';
  fake.files.set(path.join(children, `${path.basename(opts.cwd)}.json`), 'v8');
  fake.files.set(path.join(children, 'notes.txt'), 'not coverage');
  return { status: 0, stdout: '', stderr: '' };
}

async function measure(): Promise<void> {
  const { main } = (await import(SCRIPT)) as { main: () => void };
  main();
}

const written = () => JSON.parse(fake.written.get(MEASUREMENT)!) as Measurement;
const dimension = (name: string) =>
  Object.fromEntries(written().workspaces.map((ws) => [ws.path, ws.dimensions[name]]));
const vitestRuns = () =>
  fake.spawn.mock.calls.filter(
    ([command, args]) => command === 'pnpm' && args[0] === 'exec',
  );

describe('census:measure', () => {
  const argv = process.argv;
  let exit: MockInstance<typeof process.exit>;
  let stderr: MockInstance<typeof process.stderr.write>;
  const logged = () => stderr.mock.calls.map(([line]) => String(line)).join('');

  beforeEach(() => {
    fake.files.clear();
    fake.written.clear();
    fake.git.dirty = '';
    fake.spawn.mockReset().mockImplementation(spawnTools);
    Object.values(libs).forEach((fn) => fn.mockClear());
    seedRepository();
    process.argv = [argv[0]!, 'vitest'];
    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
  });

  describe('importing it', () => {
    it('runs nothing', async () => {
      await import(SCRIPT);

      expect(fake.spawn).not.toHaveBeenCalled();
      expect(fake.written.size).toBe(0);
    });
  });

  describe('on a clean tree', () => {
    it('writes both files, the measurement naming HEAD and the tools it ran', async () => {
      await measure();

      expect([...fake.written.keys()]).toEqual([MEASUREMENT, HISTORY]);
      expect(written()).toMatchObject({
        commit: 'abc1234def',
        tools: { vitest: '5.0.5', fallow: '3.36.0', storybook: '10.0.0' },
        health: { score: 90 },
        gaps: [{ id: 'the-gap' }],
      });
      expect(fake.written.get(MEASUREMENT)!.endsWith('}\n')).toBe(true);
    });

    it('counts the pyramid: every distinct suite once, PNG baselines, acceptance scenarios only', async () => {
      await measure();

      expect(written().pyramid).toEqual({ unit: 12, visual: 1, acceptance: 2 });
    });

    it('states each workspace’s code dimension from what its suite left behind', async () => {
      await measure();

      expect(dimension('code')).toEqual({
        'apps/census': {
          dimension: 'code',
          state: 'measured',
          opts: { facts: true, asProcess: ['as-process'] },
        },
        'apps/storybook': {
          dimension: 'code',
          state: 'unmeasured',
          reason: 'No vitest config',
        },
        'apps/e2e': {
          dimension: 'code',
          state: 'unmeasured',
          reason: 'No coverage block in apps/e2e/vitest.config.ts',
        },
        'apps/blank': { dimension: 'code', state: 'not-applicable', reason: 'No code' },
        'packages/ui': {
          dimension: 'code',
          state: 'unmeasured',
          reason: 'The coverage run wrote no summary',
        },
        scripts: {
          dimension: 'code',
          state: 'measured',
          opts: { floor: 70, facts: true, asProcess: ['as-process'] },
        },
      });
    });

    it('states each workspace’s visual dimension by what kind of workspace it is', async () => {
      await measure();

      expect(dimension('visual')).toEqual({
        'apps/census': {
          dimension: 'visual',
          state: 'app',
          wsPath: 'apps/census',
          routes: { routes: 1 },
        },
        'apps/storybook': {
          dimension: 'visual',
          state: 'not-applicable',
          reason: 'Renders the stories; owns none',
        },
        'apps/e2e': {
          dimension: 'visual',
          state: 'app',
          wsPath: 'apps/e2e',
          routes: null,
        },
        'apps/blank': {
          dimension: 'visual',
          state: 'not-applicable',
          reason: 'No components',
        },
        'packages/ui': { dimension: 'visual', state: 'ui' },
        scripts: {
          dimension: 'visual',
          state: 'not-applicable',
          reason: 'No components',
        },
      });
    });

    it('gives the acceptance dimension only to a deployed app, naming why the others have none', async () => {
      await measure();

      expect(dimension('acceptance')).toMatchObject({
        'apps/census': { state: 'measured' },
        'apps/e2e': { state: 'not-applicable', reason: 'The acceptance suite itself' },
        'apps/blank': { state: 'not-applicable', reason: 'Not a deployed app' },
      });
    });

    it('runs coverage only where the config measures it, the shared config from the root', async () => {
      await measure();

      const runs = Object.fromEntries(
        vitestRuns().map(([, args, opts]) => [opts.cwd, args as string[]]),
      );
      expect(Object.keys(runs)).toEqual([
        at('apps/census'),
        at('apps/e2e'),
        at('packages/ui'),
        ROOT,
      ]);
      expect(runs[at('apps/e2e')]).toContain('--coverage.enabled=false');
      expect(runs[at('apps/census')]).toContain('--coverage.reporter=json-summary');
      expect(runs[ROOT]).toEqual(
        expect.arrayContaining(['--config', 'vitest.sandcastle.config.mts']),
      );
    });

    it('hands the lib only the V8 coverage files the suites’ child processes wrote', async () => {
      await measure();

      expect(libs.testedAsProcess).toHaveBeenCalledWith(
        ['v8', 'v8', 'v8', 'v8'],
        ['apps/census/lib/a.ts'],
      );
    });

    it('merges every measured suite’s coverage map into the one file fallow reads', async () => {
      await measure();

      expect(
        Object.keys(JSON.parse(fake.files.get(path.join(OUT, 'coverage-final.json'))!)),
      ).toEqual([
        path.join(OUT, 'apps_census_vitest.config.mts'),
        path.join(OUT, 'packages_ui_vitest.config.mts'),
        path.join(OUT, 'vitest.sandcastle.config.mts'),
      ]);
    });

    it('records the duplication and the functions over the cognitive ceiling in history', async () => {
      await measure();

      expect(JSON.parse(fake.written.get(HISTORY)!)).toEqual({
        points: [{ point: { visual: 'visual-headline', dupPct: 1.5, overCeiling: 1 } }],
      });
    });

    it('reports the gaps opened and closed against the committed measurement', async () => {
      await measure();

      expect(logged()).toContain('1 gaps at abc1234');
      expect(logged()).toContain('+ opened-gap');
      expect(logged()).toContain('- closed-gap');
    });

    it('starts a history when none is committed', async () => {
      await measure();

      expect(libs.withPoint).toHaveBeenCalledWith(undefined, expect.anything());
    });
  });

  describe('on a dirty tree', () => {
    it('refuses before running anything', async () => {
      fake.git.dirty = ' M apps/census/lib/a.ts';

      await expect(measure()).rejects.toThrow('exit 1');

      expect(logged()).toContain('the tree is dirty');
      expect(fake.spawn).not.toHaveBeenCalled();
    });

    it('measures anyway with --allow-dirty', async () => {
      fake.git.dirty = ' M apps/census/lib/a.ts';
      process.argv.push('--allow-dirty');

      await measure();

      expect(fake.written.has(MEASUREMENT)).toBe(true);
    });
  });

  describe('when something fails', () => {
    it('writes nothing when a file fails validation, and names every failing path', async () => {
      libs.validateMeasurement.mockReturnValueOnce(['workspaces[0].path: required']);
      libs.validateHistory.mockReturnValueOnce(['points: empty']);

      await expect(measure()).rejects.toThrow('exit 1');

      expect(fake.written.size).toBe(0);
      expect(logged()).toContain('nothing was written; 2 problem(s)');
      expect(logged()).toContain('measurement.json workspaces[0].path: required');
      expect(logged()).toContain('history.json points: empty');
    });

    it('exits with the tail of what a failing suite printed', async () => {
      fake.spawn.mockImplementation((command: string, args: string[], opts) =>
        args[0] === 'exec'
          ? { status: 1, stdout: '', stderr: 'FAIL lib/a.test.ts' }
          : spawnTools(command, args, opts),
      );

      await expect(measure()).rejects.toThrow('exit 1');

      expect(logged()).toMatch(/pnpm exec vitest run .* exited 1\nFAIL lib\/a\.test\.ts/);
      expect(fake.written.size).toBe(0);
    });

    it('exits when fallow reports an error instead of a report', async () => {
      fake.spawn.mockImplementation((command: string, args: string[], opts) =>
        command === 'npx'
          ? { status: 2, stdout: JSON.stringify({ error: true, message: 'bad flag' }) }
          : spawnTools(command, args, opts),
      );

      await expect(measure()).rejects.toThrow('exit 1');

      expect(logged()).toContain('fallow health --score');
      expect(logged()).toContain(': bad flag');
    });

    it('refuses a feature file the feature → app map does not know', async () => {
      libs.unmappedFeatures.mockReturnValueOnce(['new-thing']);

      await expect(measure()).rejects.toThrow('exit 1');

      expect(logged()).toContain(
        'features missing from apps/census/lib/features.ts: new-thing',
      );
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});

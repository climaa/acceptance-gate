#!/usr/bin/env node
// `pnpm census:measure`: measure the repository and write the two files census is
// built from, apps/census/measurement.json and apps/census/history.json.
//
// A person runs it, before a planning session or after a wave, and commits what
// it writes in its own pull request. It is never in `pnpm gate`, the pre-push hook
// or a release: it runs every workspace's suite, a Storybook build and fallow,
// which takes minutes. Everything it decides lives in `lib/`, unit-tested; this
// file only spawns, reads and writes. Its work is behind `main()`, so importing it
// runs nothing.
//
// It refuses a dirty tree (the measurement names a commit, and a dirty tree is not
// that commit) unless `--allow-dirty` is passed, and it writes nothing when either
// file fails validation: it prints every failing path and exits 1.
//
// `--root <checkout> --out <dir>` measures ANOTHER checkout with this code: a
// repository seeded from this one, which carries a `census.config.json` at its
// root (lib/config.ts) and none of census. Both files, a copy of the config and
// the scratch directory then go under `<dir>`, and nothing is written inside the
// checkout that git would report. Its suites run under whatever Node is first on
// PATH, so the caller puts the checkout's own there.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  categoryOf,
  gapCounts,
  gapDiff,
  historyPoint,
  visualHeadline,
  withPoint,
} from '../lib/assemble.ts';
import { acceptanceValues, countScenarios } from '../lib/collect/acceptance.ts';
import { codeValue, hasCoverageBlock, linesFloor } from '../lib/collect/code.ts';
import { fileFacts, repositoryHealth, workspaceHealth } from '../lib/collect/health.ts';
import { inWorkspace, testedAsProcess } from '../lib/collect/process.ts';
import { routeStates, routeSummary } from '../lib/collect/routes.ts';
import {
  appComponents,
  appModules,
  appVisual,
  indexStories,
  storyIdsOf,
  storyImports,
  storyParts,
  uiVisual,
} from '../lib/collect/visual.ts';
import { CHECKOUT_CONFIG, DEFAULT_CONFIG, readConfig } from '../lib/config.ts';
import { featureName, unmappedFeatures } from '../lib/features.ts';
import { deriveGaps } from '../lib/gaps.ts';
import { validateHistory, validateMeasurement } from '../lib/validate.ts';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FALLOW_VERSION = '3.36.0';
/**
 * What one run measures and where it writes. This repository until `main()` reads
 * `--root` and `--out`; `target()` is the only place that sets them.
 */
/** The checkout being measured. */
let ROOT = HERE;
/** Scratch: every suite's reports and fallow's snapshot. Emptied at the start of a run. */
let OUT = join(ROOT, '.census');
/**
 * Where every suite's child processes write their NODE_V8_COVERAGE files: the
 * evidence a script its tests spawn was run, which vitest's coverage cannot see.
 */
let CHILDREN = join(OUT, 'child-coverage');
/** Where measurement.json and history.json are read from and written to. */
let DATA = join(ROOT, 'apps', 'census');
/** What the measured repository says about itself (lib/config.ts). */
let CONFIG = DEFAULT_CONFIG;
/** Another checkout is being measured: its own fallow, its config beside the output. */
let ELSEWHERE = false;
const CONFIG_NAMES = [
  'vitest.config.mts',
  'vitest.config.ts',
  'vitest.config.mjs',
  'vitest.config.js',
];
const CODE_FILE = /\.(ts|tsx|mts|mjs|js|cjs)$/;
const CONFIG_FILE =
  /(^|\/)(vitest|eslint|next|postcss|playwright)\.config\.[a-z]+$|\.d\.ts$/;
const BIG = 256 * 1024 * 1024;

const log = (line) => process.stderr.write(`census: ${line}\n`);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: BIG }).trim();
const tracked = (...paths) =>
  git('ls-files', '--', ...paths)
    .split('\n')
    .filter(Boolean);

function fail(message) {
  log(message);
  process.exit(1);
}

/** The value after a flag, as an absolute path; `undefined` when the flag is absent. */
function pathFlag(name) {
  const at = process.argv.indexOf(name);
  if (at === -1) return undefined;
  const value = process.argv[at + 1];
  if (!value || value.startsWith('--')) fail(`${name} needs a directory`);
  return resolve(value);
}

/** The checkout's own `census.config.json`, or exit naming every problem with it. */
function checkoutConfig() {
  const file = join(ROOT, CHECKOUT_CONFIG);
  if (!existsSync(file))
    fail(`${file} is missing: a checkout measured with --root says what it is there`);
  let value;
  try {
    value = readJson(file);
  } catch (error) {
    fail(`${file} is not JSON: ${error.message}`);
  }
  const read = readConfig(value, {
    has: (path) => existsSync(join(ROOT, path)),
    featureNames: tracked('apps/e2e/features/**/*.feature').map(featureName),
  });
  if (read.problems)
    fail(
      `${file} has ${read.problems.length} problem(s):\n  ${read.problems.join('\n  ')}`,
    );
  return read.config;
}

/** Point the run at another checkout when `--root` and `--out` say so. */
function target() {
  const root = pathFlag('--root');
  const out = pathFlag('--out');
  if (root === undefined && out === undefined) return;
  if (root === undefined || out === undefined)
    fail(
      '--root <checkout> and --out <dir> go together: one names what is measured, the other where it is written',
    );
  if (!existsSync(root)) fail(`--root ${root} does not exist`);
  ROOT = root;
  DATA = out;
  OUT = join(out, '.census');
  CHILDREN = join(OUT, 'child-coverage');
  ELSEWHERE = true;
  CONFIG = checkoutConfig();
}

/** Run a command; its stdout, or exit with what it printed. */
function run(command, args, cwd = ROOT, { allowExit = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: BIG,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0 && !allowExit) {
    fail(
      `${command} ${args.join(' ')} exited ${result.status}\n${(result.stderr || result.stdout).slice(-4000)}`,
    );
  }
  return result.stdout;
}

function workspaces() {
  const packages = tracked('apps/*/package.json', 'packages/*/package.json').map(
    (file) => ({
      name: readJson(join(ROOT, file)).name,
      path: dirname(file),
    }),
  );
  return [...packages, ...CONFIG.pseudoWorkspaces].map((ws) => ({
    ...ws,
    category: categoryOf(ws.path),
  }));
}

/** The vitest config a workspace runs under, repo-relative, if any. */
function configOf(ws) {
  // The pseudo-workspaces have no config of their own: the shared hermetic one measures them.
  if (CONFIG.pseudoWorkspaces.some((pseudo) => pseudo.path === ws.path))
    return CONFIG.sharedVitestConfig ?? undefined;
  const name = CONFIG_NAMES.find((n) => existsSync(join(ROOT, ws.path, n)));
  return name ? `${ws.path}/${name}` : undefined;
}

/** One suite run: coverage into `.census/<dir>` when the config measures it, test totals always. */
function runSuite(config, dir) {
  const measured = hasCoverageBlock(readFileSync(join(ROOT, config), 'utf8'));
  const out = join(OUT, dir);
  const shared = config === CONFIG.sharedVitestConfig;
  const coverage = measured
    ? [
        '--coverage.reporter=json-summary',
        '--coverage.reporter=json',
        `--coverage.reportsDirectory=${out}`,
      ]
    : ['--coverage.enabled=false'];
  log(`vitest ${config}${measured ? ' (coverage)' : ''}`);
  run(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      ...(shared ? ['--config', config] : []),
      ...coverage,
      '--reporter=json',
      `--outputFile=${join(out, 'tests.json')}`,
    ],
    shared ? ROOT : join(ROOT, dirname(config)),
    { env: { NODE_V8_COVERAGE: CHILDREN } },
  );
  return {
    measured,
    tests: readJson(join(out, 'tests.json')).numTotalTests,
    dir: out,
    config,
  };
}

function runSuites(list) {
  const runs = new Map();
  for (const ws of list) {
    const config = configOf(ws);
    if (config && !runs.has(config))
      runs.set(config, runSuite(config, config.replaceAll('/', '_')));
  }
  return runs;
}

/**
 * The repo-relative code files some suite's child process loaded. Read once every
 * suite is done; a file a killed process left half-written is skipped by the lib.
 */
function processRuns() {
  const texts = existsSync(CHILDREN)
    ? readdirSync(CHILDREN)
        .filter((name) => name.endsWith('.json'))
        .map((name) => readFileSync(join(CHILDREN, name), 'utf8'))
    : [];
  return testedAsProcess(
    texts,
    tracked('.').filter((f) => CODE_FILE.test(f)),
  );
}

/** Every measured suite's coverage map in one file: fallow takes a single `--coverage`. */
function mergeCoverage(runs) {
  const merged = {};
  for (const r of runs.values()) {
    const file = join(r.dir, 'coverage-final.json');
    if (r.measured && existsSync(file)) Object.assign(merged, readJson(file));
  }
  const path = join(OUT, 'coverage-final.json');
  writeFileSync(path, JSON.stringify(merged));
  return path;
}

function fallow(args) {
  // Another checkout runs the fallow it pins; this one, the version named above.
  const [command, prefix] = ELSEWHERE
    ? ['pnpm', ['exec', 'fallow']]
    : ['npx', ['-y', `fallow@${FALLOW_VERSION}`]];
  const parsed = JSON.parse(
    run(command, [...prefix, ...args, '--format', 'json'], ROOT, { allowExit: true }),
  );
  if (parsed.error) fail(`fallow ${args.join(' ')}: ${parsed.message}`);
  return parsed;
}

function groupsOf(report) {
  return Object.fromEntries(
    report.groups.map((g) => [
      g.key,
      {
        score: g.health_score.score,
        grade: g.health_score.grade,
        penalties: g.health_score.penalties,
      },
    ]),
  );
}

function fallowReports(coverage) {
  log('fallow');
  const cov = ['--coverage', coverage];
  const health = fallow([
    'health',
    '--score',
    '--hotspots',
    '--targets',
    '--file-scores',
    '--coverage-gaps',
    '--css',
    '--report-only',
    ...cov,
    '--save-snapshot',
    relative(ROOT, join(OUT, 'snapshot.json')),
  ]);
  return {
    health,
    complexity: fallow([
      'health',
      '--complexity',
      '--max-cognitive',
      '20',
      '--max-cyclomatic',
      '65535',
      '--max-crap',
      '1000000000',
      '--report-only',
    ]),
    dead: fallow(['dead-code']),
    boundaries: fallow(['list', '--boundaries']),
    dupesMild: fallow(['dupes', '--mode', 'mild']),
    dupesSemantic: fallow(['dupes', '--mode', 'semantic']),
    groups: {
      ...groupsOf(
        fallow(['health', '--score', '--report-only', '--group-by', 'directory']),
      ),
      ...groupsOf(
        fallow(['health', '--score', '--report-only', '--group-by', 'package']),
      ),
    },
  };
}

function storybookStories() {
  log('storybook build (turbo cache)');
  run('pnpm', [
    'turbo',
    'run',
    'build',
    `--filter=${readJson(join(ROOT, CONFIG.storybook, 'package.json')).name}`,
    '--output-logs=errors-only',
  ]);
  return indexStories(
    readJson(join(ROOT, CONFIG.storybook, 'storybook-static', 'index.json')),
    CONFIG.storybook,
  );
}

function visualSources() {
  const tileMaps = tracked('designs/exports/*.tiles.json').map((file) => ({
    board: file
      .split('/')
      .at(-1)
      .replace(/\.tiles\.json$/, ''),
    keys: Object.keys(readJson(join(ROOT, file)).tiles),
  }));
  const tileKeys = tileMaps.flatMap((map) => map.keys);
  const boards = new Map(
    tileMaps.flatMap(({ board, keys }) => [...storyIdsOf(keys)].map((id) => [id, board])),
  );
  const baselines = tracked('packages/visual-diff/__baselines__').filter((f) =>
    f.endsWith('.png'),
  );
  const imports = new Map(
    tracked('*.stories.tsx').map((file) => [
      file,
      storyImports(file, readFileSync(join(ROOT, file), 'utf8')),
    ]),
  );
  return {
    tiled: storyIdsOf(tileKeys),
    boards,
    baselined: storyIdsOf(baselines.map((f) => f.split('/').at(-1))),
    baselines,
    imports,
  };
}

function featureCounts() {
  const files = tracked('apps/e2e/features/**/*.feature');
  const unmapped = unmappedFeatures(files.map(featureName), CONFIG);
  if (unmapped.length > 0)
    fail(
      `features missing from ${ELSEWHERE ? CHECKOUT_CONFIG : 'apps/census/lib/features.ts'}: ${unmapped.join(', ')}`,
    );
  const counts = Object.fromEntries(
    files.map((f) => [
      featureName(f),
      countScenarios(readFileSync(join(ROOT, f), 'utf8')),
    ]),
  );
  const acceptance = files
    .filter((f) => f.includes('/features/acceptance/'))
    .map(featureName);
  return { counts, suite: acceptance.reduce((sum, name) => sum + counts[name], 0) };
}

function codeDimension(ws, runs, reports, asProcess) {
  const sources = tracked(ws.path).filter(
    (f) => CODE_FILE.test(f) && !CONFIG_FILE.test(f),
  );
  if (sources.length === 0)
    return { dimension: 'code', state: 'not-applicable', reason: 'No code' };
  const config = configOf(ws);
  if (!config)
    return { dimension: 'code', state: 'unmeasured', reason: 'No vitest config' };
  const suite = runs.get(config);
  if (!suite.measured)
    return {
      dimension: 'code',
      state: 'unmeasured',
      reason: `No coverage block in ${config}`,
    };
  const summary = join(suite.dir, 'coverage-summary.json');
  if (!existsSync(summary))
    return {
      dimension: 'code',
      state: 'unmeasured',
      reason: 'The coverage run wrote no summary',
    };
  const floor = linesFloor(readFileSync(join(ROOT, config), 'utf8'), ws.path);
  return codeValue(readJson(summary), join(ROOT, ws.path), {
    ...(floor === undefined ? {} : { floor }),
    ...fileFacts(reports, ws.path),
    asProcess: inWorkspace(asProcess, ws.path),
  });
}

/** A source file the walk from a screen story can reach. */
const MODULE_FILE = /\.(tsx|ts|mts|jsx|js|mjs)$/;

const NO_SUBJECTS = { incomplete: [], unstoried: [], routes: [] };

function visualDimension(ws, stories, sources) {
  const own = stories.filter((s) => s.file.startsWith(`${ws.path}/`));
  const parts = storyParts(own, sources.tiled, sources.baselined);
  if (ws.path === 'packages/ui') {
    const ui = uiVisual(
      tracked(ws.path),
      stories,
      sources.tiled,
      sources.baselined,
      sources.imports,
      sources.boards,
    );
    return {
      value: ui.value,
      subjects: { ...NO_SUBJECTS, incomplete: parts, unstoried: ui.unstoried },
    };
  }
  if (ws.path === CONFIG.storybook) {
    return {
      value: {
        dimension: 'visual',
        state: 'not-applicable',
        reason: 'Renders the stories; owns none',
      },
      subjects: NO_SUBJECTS,
    };
  }
  const appFiles = tracked(`${ws.path}/app`).map((f) =>
    f.slice(`${ws.path}/app/`.length),
  );
  const files = tracked(ws.path).filter((f) => f.endsWith('.tsx'));
  if (appFiles.length === 0 && files.length === 0) {
    return {
      value: { dimension: 'visual', state: 'not-applicable', reason: 'No components' },
      subjects: NO_SUBJECTS,
    };
  }
  const routes = routeStates(appFiles);
  const read = (path) => ({ path, source: readFileSync(join(ROOT, path), 'utf8') });
  const components = appComponents(files.map(read));
  const modules = appModules(
    tracked(ws.path)
      .filter((f) => MODULE_FILE.test(f))
      .map(read),
  );
  const app = appVisual(ws.path, {
    components,
    imports: sources.imports,
    modules,
    stories,
    tiled: sources.tiled,
    boards: sources.boards,
    baselined: sources.baselined,
    ...(routes.length === 0 ? {} : { routes: routeSummary(routes) }),
  });
  return {
    value: app.value,
    subjects: { incomplete: parts, unstoried: app.unstoried, routes },
  };
}

function acceptanceDimension(ws, values) {
  if (values[ws.path]) return values[ws.path];
  const reason =
    ws.path === 'apps/e2e' ? 'The acceptance suite itself' : 'Not a deployed app';
  return { dimension: 'acceptance', state: 'not-applicable', reason };
}

function measureWorkspaces(list, inputs) {
  const subjects = {};
  const parts = [];
  const measured = list.map((ws) => {
    const visual = visualDimension(ws, inputs.stories, inputs.sources);
    subjects[ws.path] = visual.subjects;
    parts.push(...visual.subjects.incomplete);
    return {
      name: ws.name,
      path: ws.path,
      category: ws.category,
      dimensions: {
        code: codeDimension(ws, inputs.runs, inputs.reports, inputs.asProcess),
        visual: visual.value,
        acceptance: acceptanceDimension(ws, inputs.acceptance),
        health: workspaceHealth(inputs.reports, ws),
      },
    };
  });
  return { workspaces: measured, subjects, parts };
}

/** The installed version of a package, read from the first of `froms` that depends on it. */
function versionOf(pkg, froms) {
  const manifest = froms
    .map((from) => join(ROOT, from, 'node_modules', pkg, 'package.json'))
    .find((file) => existsSync(file));
  if (!manifest) fail(`${pkg} is installed in none of: ${froms.join(', ')}`);
  return readJson(manifest).version;
}

function refuseDirtyTree() {
  if (process.argv.includes('--allow-dirty')) return;
  const dirty = git(
    'status',
    '--porcelain',
    '--',
    '.',
    ':!apps/census/measurement.json',
    ':!apps/census/history.json',
  );
  if (dirty)
    fail(
      `the tree is dirty, so HEAD is not what would be measured (pass --allow-dirty to measure anyway):\n${dirty}`,
    );
}

function readCommitted(name) {
  const path = join(DATA, name);
  return existsSync(path) ? readJson(path) : undefined;
}

function report(measurement, before) {
  const counts = gapCounts(measurement.gaps);
  log(`${measurement.gaps.length} gaps at ${measurement.commit.slice(0, 7)}`);
  for (const [kind, n] of Object.entries(counts)) log(`  ${kind.padEnd(22)} ${n}`);
  const diff = gapDiff(before?.gaps, measurement.gaps);
  log(
    `against the committed measurement: ${diff.opened.length} opened, ${diff.closed.length} closed`,
  );
  for (const id of diff.opened) log(`  + ${id}`);
  for (const id of diff.closed) log(`  - ${id}`);
}

function write(measurement, history) {
  const problems = [
    ...validateMeasurement(measurement, CONFIG).map((p) => `measurement.json ${p}`),
    ...validateHistory(history).map((p) => `history.json ${p}`),
  ];
  if (problems.length > 0)
    fail(
      `nothing was written; ${problems.length} problem(s):\n  ${problems.join('\n  ')}`,
    );
  writeFileSync(
    join(DATA, 'measurement.json'),
    `${JSON.stringify(measurement, null, 2)}\n`,
  );
  writeFileSync(join(DATA, 'history.json'), `${JSON.stringify(history, null, 2)}\n`);
  // Beside another checkout's numbers, what it said about itself: whoever reads
  // the two files needs its feature map to read them.
  if (ELSEWHERE)
    writeFileSync(join(DATA, CHECKOUT_CONFIG), `${JSON.stringify(CONFIG, null, 2)}\n`);
}

/** The tools' versions: this repository names its fallow, another checkout has its own installed. */
function toolVersions(list) {
  const anywhere = list.map((ws) => ws.path);
  return {
    vitest: versionOf('vitest', ['apps/census', ...anywhere]),
    fallow: ELSEWHERE ? versionOf('fallow', ['.']) : FALLOW_VERSION,
    storybook: versionOf('storybook', [CONFIG.storybook]),
    node: process.versions.node,
  };
}

export function main() {
  target();
  refuseDirtyTree();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const list = workspaces();
  const features = featureCounts();
  const runs = runSuites(list);
  const asProcess = processRuns();
  const reports = fallowReports(mergeCoverage(runs));
  const stories = storybookStories();
  const sources = visualSources();
  const measured = measureWorkspaces(list, {
    runs,
    asProcess,
    reports,
    stories,
    sources,
    acceptance: acceptanceValues(features.counts, CONFIG),
  });
  const measurement = {
    schema: 1,
    repo: CONFIG.repo,
    commit: git('rev-parse', 'HEAD'),
    measuredAt: new Date().toISOString(),
    tools: toolVersions(list),
    pyramid: {
      unit: [...runs.values()].reduce((sum, r) => sum + r.tests, 0),
      visual: sources.baselines.length,
      acceptance: features.suite,
    },
    health: repositoryHealth(reports),
    workspaces: measured.workspaces,
    gaps: deriveGaps(measured.workspaces, measured.subjects, CONFIG),
  };
  const overCeiling = reports.complexity.findings.filter((f) => f.cognitive > 20).length;
  const point = historyPoint(
    measurement,
    {
      visual: visualHeadline(measured.parts),
      dupPct: reports.health.vital_signs.duplication_pct,
      overCeiling,
    },
    CONFIG,
  );
  const before = readCommitted('measurement.json');
  write(measurement, withPoint(readCommitted('history.json'), point));
  report(measurement, before);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();

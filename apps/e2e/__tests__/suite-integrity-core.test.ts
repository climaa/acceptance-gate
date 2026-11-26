import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkLaneCoverage,
  type Lane,
  parseFeature,
  runIntegrityCheck,
} from '../scripts/lib/suite-integrity-core.mjs';

// Neither bddgen nor Playwright is spawned: the guard's logic is what reads the
// `--list` report, and the report is data this suite hands it.
const { execFileSync } = vi.hoisted(() => ({ execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync }));

/** `process.exit` never returns; the stub keeps that true by throwing. */
class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

interface ListedTest {
  projectName: string;
  expectedStatus?: string;
}

interface ListedSpec {
  file: string;
  title: string;
  tests: ListedTest[];
}

const PROJECTS = [{ name: 'desktop' }, { name: 'mobile' }];

function spec(
  title: string,
  projects = ['desktop', 'mobile'],
  status = 'passed',
): ListedSpec {
  return {
    file: 'features/acceptance/blog.feature.spec.js',
    title,
    tests: projects.map((projectName) => ({ projectName, expectedStatus: status })),
  };
}

/** Playwright nests a suite per file and per describe block; so does this. */
function report(specs: ListedSpec[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    config: { projects: PROJECTS },
    suites: [{ suites: [{ specs }] }],
    ...extra,
  });
}

const workspaces: string[] = [];

/** A workspace with both binaries present and the given feature files. */
function workspace(
  features: Record<string, string>,
  binaries = ['bddgen', 'playwright'],
) {
  const root = mkdtempSync(join(tmpdir(), 'suite-integrity-'));
  workspaces.push(root);
  for (const name of binaries) {
    const path = join(root, 'node_modules', '.bin', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '');
  }
  mkdirSync(join(root, 'features', 'acceptance'), { recursive: true });
  for (const [file, text] of Object.entries(features)) {
    const path = join(root, 'features', 'acceptance', file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }

  return root;
}

function lane(root: string, overrides: Partial<Lane> = {}): Lane {
  return {
    workspace: root,
    featuresDir: 'features/acceptance',
    expected: 1,
    expectedName: 'EXPECTED_SCENARIOS',
    name: 'acceptance',
    ...overrides,
  };
}

/** bddgen answers first, then `playwright test --list` with `listOutput`. */
function listing(listOutput: string) {
  execFileSync.mockImplementation((bin: string) =>
    bin.endsWith('playwright') ? listOutput : '',
  );
}

const PLAIN = 'Feature: Blog\n  Scenario: Reads a post\n';

let errors: string[];
let logs: string[];

beforeEach(() => {
  errors = [];
  logs = [];
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    errors.push(line);
  });
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    logs.push(line);
  });
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Exit(code as number | undefined);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  execFileSync.mockReset();
  for (const root of workspaces.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** The findings a failed run printed, without the header and the footer. */
function findings() {
  return errors.slice(1, -1).map((line) => line.trim());
}

describe('parseFeature', () => {
  it('records each tag with its line, Feature tags apart from scenario tags', () => {
    // Arrange
    const text = [
      '@desktop @mode:serial',
      'Feature: Blog',
      '',
      '  @skip',
      '  Scenario: Reads a post',
      '  Scenario Outline: Opens <tag>',
      '  @slow',
      '  Example: A rule example',
    ].join('\n');

    // Act
    const feature = parseFeature(text);

    // Assert
    expect(feature).toEqual({
      featureTags: [
        { tag: '@desktop', line: 1 },
        { tag: '@mode:serial', line: 1 },
      ],
      scenarios: [
        { title: 'Reads a post', tags: [{ tag: '@skip', line: 4 }] },
        { title: 'Opens <tag>', tags: [] },
        { title: 'A rule example', tags: [{ tag: '@slow', line: 7 }] },
      ],
    });
  });

  it('returns nothing for a file with no Feature and no scenario', () => {
    // Arrange
    const text = '# just a comment\n';

    // Act
    const feature = parseFeature(text);

    // Assert
    expect(feature).toEqual({ featureTags: [], scenarios: [] });
  });
});

describe('checkLaneCoverage', () => {
  it('names a .feature file that sits in no lane, and only that one', () => {
    // Arrange
    const root = mkdtempSync(join(tmpdir(), 'lane-coverage-'));
    workspaces.push(root);
    for (const file of [
      'acceptance/a.feature',
      'local/deep/b.feature',
      'stray.feature',
      'notes.md',
    ]) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), PLAIN);
    }

    // Act
    const gaps = checkLaneCoverage(root, ['acceptance', 'local']);

    // Assert
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatch(/^features\/stray\.feature is in no lane/);
    expect(gaps[0]).toContain('features/acceptance/ or features/local/');
  });

  it('finds nothing when every file is inside a lane', () => {
    // Arrange
    const root = mkdtempSync(join(tmpdir(), 'lane-coverage-'));
    workspaces.push(root);
    mkdirSync(join(root, 'acceptance'));
    writeFileSync(join(root, 'acceptance', 'a.feature'), PLAIN);

    // Act
    const gaps = checkLaneCoverage(root, ['acceptance']);

    // Assert
    expect(gaps).toEqual([]);
  });
});

describe('runIntegrityCheck', () => {
  it('passes a suite whose count, statuses, projects and tags all hold', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(report([spec('Reads a post')]));

    // Act
    runIntegrityCheck(lane(root, { config: 'playwright.local.config.ts' }));

    // Assert
    expect(errors).toEqual([]);
    expect(logs).toEqual([
      '✓ acceptance integrity OK — 1 scenarios, 1 tests, all expected to pass.',
    ]);
    expect(
      execFileSync.mock.calls.map(([bin, args]) => [String(bin).split('/').pop(), args]),
    ).toEqual([
      ['bddgen', ['-c', 'playwright.local.config.ts']],
      [
        'playwright',
        [
          'test',
          '--list',
          '--forbid-only',
          '--reporter=json',
          '--config',
          'playwright.local.config.ts',
        ],
      ],
    ]);
  });

  it('refuses a scenario count that moved, listing what it did find', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(report([spec('Reads a post')]));

    // Act
    const run = () => runIntegrityCheck(lane(root, { expected: 2 }));

    // Assert
    expect(run).toThrow(new Exit(1));
    expect(errors[0]).toBe('✗ acceptance integrity');
    expect(findings()).toEqual([
      '1 scenarios listed, EXPECTED_SCENARIOS is 2\n      features/acceptance/blog.feature › Reads a post',
    ]);
    expect(errors.at(-1)).toContain('never narrowed to pass');
  });

  it('refuses a count above the constant too: the check is exact equality', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(report([spec('Reads a post'), spec('Writes a comment')]));

    // Act
    const run = () => runIntegrityCheck(lane(root, { expected: 1 }));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()[0]).toMatch(/^2 scenarios listed, EXPECTED_SCENARIOS is 1\n/);
  });

  it('refuses a listed test that is not expected to pass', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(report([spec('Reads a post', ['desktop', 'mobile'], 'skipped')]));

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      'features/acceptance/blog.feature › Reads a post [desktop] expects "skipped", not "passed"',
      'features/acceptance/blog.feature › Reads a post [mobile] expects "skipped", not "passed"',
    ]);
  });

  it('refuses a project that runs nothing and a scenario that lands in no project', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(
      report([spec('Reads a post', ['desktop']), { ...spec('Orphan', []), tests: [] }]),
    );

    // Act
    const run = () => runIntegrityCheck(lane(root, { expected: 2 }));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      'features/acceptance/blog.feature › Orphan runs in no project',
      'project "mobile" runs nothing',
    ]);
  });

  it('refuses control tags case-insensitively, prefixes included', () => {
    // Arrange
    const root = workspace({
      'blog.feature':
        '@Only\nFeature: Blog\n  @retries:2 @desktop\n  Scenario: Reads a post\n',
    });
    listing(report([spec('Reads a post')]));

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      'features/acceptance/blog.feature:1 — @Only on the Feature is playwright-bdd control vocabulary',
      'features/acceptance/blog.feature:3 — @retries:2 on "Reads a post" is playwright-bdd control vocabulary',
    ]);
  });

  it('allows @mode:serial on the Feature of a declared file only', () => {
    // Arrange
    const root = workspace({
      'flow.feature': '@mode:serial\nFeature: Flow\n  Scenario: Step one\n',
      'loose.feature': '@mode:serial\nFeature: Loose\n  Scenario: Step two\n',
    });
    listing(report([spec('Step one'), spec('Step two')]));

    // Act
    const run = () =>
      runIntegrityCheck(lane(root, { expected: 2, serialFeatures: ['flow.feature'] }));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      "features/acceptance/loose.feature:1 — @mode:serial on the Feature couples a file's " +
        "scenarios into one flow — name the file in the lane's serialFeatures to declare that",
    ]);
  });

  it('refuses @mode:serial on a scenario even inside a declared file', () => {
    // Arrange
    const root = workspace({
      'flow.feature':
        '@mode:serial\nFeature: Flow\n  @mode:serial\n  Scenario: Step one\n',
    });
    listing(report([spec('Step one')]));

    // Act
    const run = () => runIntegrityCheck(lane(root, { serialFeatures: ['flow.feature'] }));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      'features/acceptance/flow.feature:3 — @mode:serial on "Step one" applies to a whole ' +
        'feature; playwright-bdd ignores it here',
    ]);
  });

  it('refuses a serialFeatures entry that is untagged or does not exist', () => {
    // Arrange
    const root = workspace({ 'flow.feature': PLAIN });
    listing(report([spec('Reads a post')]));

    // Act
    const run = () =>
      runIntegrityCheck(lane(root, { serialFeatures: ['flow.feature', 'gone.feature'] }));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      'features/acceptance/gone.feature is in serialFeatures but does not exist',
      'features/acceptance/flow.feature is named in serialFeatures but its Feature carries no ' +
        '@mode:serial — either tag it or drop it from the list',
    ]);
  });

  it('refuses a features directory that holds no .feature file', () => {
    // Arrange
    const root = workspace({ 'README.md': 'not a feature' });
    listing(report([spec('Reads a post')]));

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual([
      `no .feature files found under ${join(root, 'features/acceptance')}`,
    ]);
  });

  it("reports the lane's own tag rule and whole-tree checks beside the shared ones", () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    listing(report([spec('Reads a post')]));
    const checkTags = vi.fn((file: string) => [`${file} breaks the lane rule`]);

    // Act
    const run = () =>
      runIntegrityCheck(
        lane(root, { checkTags, extraChecks: () => ['a whole-tree finding'] }),
      );

    // Assert
    expect(run).toThrow(Exit);
    expect(checkTags).toHaveBeenCalledWith(
      'features/acceptance/blog.feature',
      expect.objectContaining({ scenarios: [{ title: 'Reads a post', tags: [] }] }),
    );
    expect(findings()).toEqual([
      'features/acceptance/blog.feature breaks the lane rule',
      'a whole-tree finding',
    ]);
  });

  it('reports a refused listing by its load errors, once each', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    const refused = report([], {
      errors: [
        { message: 'Error: focused item found\n    at blog.feature.spec.js' },
        { message: 'Error: focused item found\n    at blog.feature.spec.js' },
        'a bare string error',
      ],
    });
    execFileSync.mockImplementation((bin: string) => {
      if (!bin.endsWith('playwright')) return '';
      throw Object.assign(new Error('exit 1'), { stdout: Buffer.from(refused) });
    });

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual(['Error: focused item found', 'a bare string error']);
  });

  it('reports a listing that crashed by its stderr', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    execFileSync.mockImplementation((bin: string) => {
      if (!bin.endsWith('playwright')) return '';
      throw Object.assign(new Error('spawn failed'), {
        stderr: Buffer.from('  config threw  \n'),
      });
    });

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual(['config threw']);
  });

  it('reports a bddgen failure by its message when it wrote no stderr', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN });
    execFileSync.mockImplementation(() => {
      throw new Error('E2E_BASE_URL is required in CI');
    });

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(findings()).toEqual(['E2E_BASE_URL is required in CI']);
  });

  it('stops before spawning anything when a binary is not installed', () => {
    // Arrange
    const root = workspace({ 'blog.feature': PLAIN }, []);

    // Act
    const run = () => runIntegrityCheck(lane(root));

    // Assert
    expect(run).toThrow(Exit);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(errors[1]?.trim()).toBe(
      `bddgen binary not found at ${join(root, 'node_modules', '.bin', 'bddgen')} — run \`pnpm install\` first.`,
    );
  });
});

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import {
  coverageOf,
  coverageProblem,
  failureLines,
  freezeLines,
  freezeList,
  judge,
  main,
  mapsProblem,
  mergeMaps,
  offenders,
  readFrozen,
  rebase,
  roundUp,
  suites,
  // @ts-expect-error — plain .mjs with JSDoc types, no declaration file.
} from '../crap-gate.mjs';

/**
 * The CRAP gate: merges every suite's coverage map onto this checkout, scores the
 * functions census measures with fallow, and refuses a function at CRAP 30 or
 * more that is not on the frozen list, a listed one above its frozen value, and
 * any run whose coverage is an estimate. The fallow reports are real output of
 * fallow 3.36.0 on this repository, trimmed to the fields the gate reads.
 */
const FIXTURES = resolve(__dirname, 'fixtures', 'crap-gate');
const fixtureText = (name: string) =>
  readFileSync(join(FIXTURES, `${name}.json`), 'utf8');
const fixture = (name: string) => JSON.parse(fixtureText(name));

type Finding = {
  path: string;
  name: string;
  line: number;
  cyclomatic: number;
  crap?: number;
  coverage_source?: string;
};

/** A checkout another worktree's turbo cache hit would have written its paths from. */
const OTHER_ROOT = '/home/runner/work/acceptance-gate/acceptance-gate';

const entry = (path: string) => ({
  path,
  statementMap: {},
  fnMap: {},
  branchMap: {},
  s: {},
  f: {},
  b: {},
});

let root: string;

function write(rel: string, text = '') {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A suite's map at `dir`, its keys written by the checkout at `from`. */
function writeMap(dir: string, files: string[], from = OTHER_ROOT) {
  const map = Object.fromEntries(
    files.map((rel) => [`${from}/${rel}`, entry(`${from}/${rel}`)]),
  );
  write(join(dir, 'coverage', 'coverage-final.json'), JSON.stringify(map));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'crap-gate-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('suites', () => {
  it("lists the root's own suite and each workspace with a vitest config", () => {
    // Arrange
    write('vitest.sandcastle.config.mts');
    write('apps/blog/vitest.config.mts');
    write('apps/e2e/vitest.config.ts');
    write('packages/tsconfig/package.json', '{}');

    // Act
    const found = suites(root);

    // Assert
    expect(found).toEqual([
      { dir: '', file: join(root, 'coverage/coverage-final.json') },
      { dir: 'apps/blog', file: join(root, 'apps/blog/coverage/coverage-final.json') },
      { dir: 'apps/e2e', file: join(root, 'apps/e2e/coverage/coverage-final.json') },
    ]);
  });
});

describe('mapsProblem', () => {
  it('passes when every suite left its map', () => {
    // Arrange
    write('vitest.sandcastle.config.mts');
    writeMap('', []);

    // Act
    const problem = mapsProblem(suites(root));

    // Assert
    expect(problem).toBeNull();
  });

  it('names each suite that left no map', () => {
    // Arrange
    write('vitest.sandcastle.config.mts');
    write('apps/blog/vitest.config.mts');
    writeMap('apps/blog', []);

    // Act
    const problem = mapsProblem(suites(root));

    // Assert
    expect(problem).toBe(
      'no coverage map from 1 of 2 suite(s): coverage/coverage-final.json',
    );
  });

  it('refuses a checkout with no suite at all', () => {
    // Arrange: an empty checkout.

    // Act
    const problem = mapsProblem(suites(root));

    // Assert
    expect(problem).toBe('no vitest suite found, so there is no coverage map');
  });
});

describe('rebase', () => {
  it("moves another checkout's path onto this root", () => {
    // Arrange
    write('apps/blog/lib/a.ts');

    // Act
    const path = rebase(`${OTHER_ROOT}/apps/blog/lib/a.ts`, root, 'apps/blog');

    // Assert
    expect(path).toBe(join(root, 'apps/blog/lib/a.ts'));
  });

  it("keeps a path already under this root, for the root suite's directories", () => {
    // Arrange
    write('scripts/gate/run.mjs');

    // Act
    const path = rebase(join(root, 'scripts/gate/run.mjs'), root, '');

    // Assert
    expect(path).toBe(join(root, 'scripts/gate/run.mjs'));
  });

  it("does not move a file outside the suite's own directory", () => {
    // Arrange
    write('lib/a.ts');

    // Act
    const path = rebase(`${OTHER_ROOT}/apps/blog/lib/a.ts`, root, 'apps/blog');

    // Assert
    expect(path).toBeNull();
  });

  it('drops a file this checkout no longer has', () => {
    // Arrange: nothing on disk.

    // Act
    const path = rebase(`${OTHER_ROOT}/apps/blog/lib/gone.ts`, root, 'apps/blog');

    // Assert
    expect(path).toBeNull();
  });
});

describe('mergeMaps', () => {
  it('merges every map, each entry keyed and pathed under this root', () => {
    // Arrange
    write('apps/blog/lib/a.ts');
    write('scripts/gate/run.mjs');
    writeMap('apps/blog', ['apps/blog/lib/a.ts', 'apps/blog/lib/gone.ts']);
    writeMap('', ['scripts/gate/run.mjs'], root);
    const maps = [
      { dir: 'apps/blog', file: join(root, 'apps/blog/coverage/coverage-final.json') },
      { dir: '', file: join(root, 'coverage/coverage-final.json') },
    ];

    // Act
    const merged = mergeMaps(maps, root);

    // Assert
    const blog = join(root, 'apps/blog/lib/a.ts');
    expect(Object.keys(merged).sort()).toEqual([
      blog,
      join(root, 'scripts/gate/run.mjs'),
    ]);
    expect(merged[blog]).toEqual(entry(blog));
  });
});

describe('coverageProblem', () => {
  it('passes a report scored on maps fallow matched file for file', () => {
    // Arrange
    const report = fixture('measured');

    // Act
    const problem = coverageProblem(report);

    // Assert
    expect(problem).toBeNull();
  });

  it('refuses a report fallow estimated with no map at all', () => {
    // Arrange
    const report = fixture('no-map');

    // Act
    const problem = coverageProblem(report);

    // Assert
    expect(problem).toMatch(/matched no file/);
  });

  it('refuses a report on a map none of whose files fallow matched', () => {
    // Arrange
    const report = fixture('empty-map');

    // Act
    const problem = coverageProblem(report);

    // Assert
    expect(problem).toMatch(/matched no file/);
  });

  it("refuses a report on maps whose paths are another checkout's", () => {
    // Arrange
    const report = fixture('cross-checkout');

    // Act
    const problem = coverageProblem(report);

    // Assert
    expect(problem).toBe(
      'fallow matched 60 of the 435 files in the coverage map; the rest are scored on an estimate',
    );
  });

  it('refuses a report whose every CRAP finding is estimated', () => {
    // Arrange
    const report = fixture('measured');
    report.findings = report.findings.map((f: Finding) =>
      f.crap === undefined ? f : { ...f, coverage_source: 'estimated' },
    );

    // Act
    const problem = coverageProblem(report);

    // Assert
    expect(problem).toBe('every CRAP finding is scored on estimated coverage');
  });
});

describe('offenders', () => {
  it('keeps the findings at CRAP 30 or more, in every directory census measures', () => {
    // Arrange
    const report = fixture('measured');

    // Act
    const found: Finding[] = offenders(report);

    // Assert
    expect(found).toHaveLength(39);
    expect(found.every((f) => (f.crap ?? 0) >= 30)).toBe(true);
    expect(new Set(found.map((f) => f.path.split('/')[0]))).toEqual(
      new Set(['apps', 'scripts', '.sandcastle', '.claude']),
    );
  });

  it('counts a function at exactly 30, and none of the complexity-only findings', () => {
    // Arrange
    const report = fixture('measured');

    // Act
    const names = offenders(report).map((f: Finding) => f.name);

    // Assert
    expect(names).toContain('reapExitedContainers');
    expect(names).not.toContain('BoardPane');
  });

  it('ignores a function outside what census measures', () => {
    // Arrange
    const report = {
      findings: [{ path: 'designs/x.mjs', name: 'f', line: 1, cyclomatic: 9, crap: 90 }],
    };

    // Act
    const found = offenders(report);

    // Assert
    expect(found).toEqual([]);
  });
});

describe('judge', () => {
  const run = (crap: number): Finding => ({
    path: 'scripts/gate/run.mjs',
    name: 'run',
    line: 267,
    cyclomatic: 14,
    crap,
  });

  it('fails a function not on the frozen list', () => {
    // Arrange
    const found = [run(210)];

    // Act
    const failures = judge(found, []);

    // Assert
    expect(failures).toEqual([{ finding: run(210), frozen: null }]);
  });

  it('fails a listed function above its frozen value', () => {
    // Arrange
    const frozen = [{ path: 'scripts/gate/run.mjs', name: 'run', crap: 200 }];

    // Act
    const failures = judge([run(210)], frozen);

    // Assert
    expect(failures).toEqual([{ finding: run(210), frozen: 200 }]);
  });

  it('passes a listed function at or below its frozen value', () => {
    // Arrange
    const frozen = [{ path: 'scripts/gate/run.mjs', name: 'run', crap: 210 }];

    // Act
    const failures = judge([run(210), { ...run(90), line: 300 }], frozen);

    // Assert
    expect(failures).toEqual([]);
  });

  it('does not let a listed name cover the same name in another file', () => {
    // Arrange
    const frozen = [{ path: 'scripts/gate/lock.mjs', name: 'run', crap: 500 }];

    // Act
    const failures = judge([run(210)], frozen);

    // Assert
    expect(failures).toHaveLength(1);
  });

  it('lists the worst first', () => {
    // Arrange
    const found = [run(42), { ...run(210), name: 'other' }];

    // Act
    const failures = judge(found, []);

    // Assert
    expect(failures.map((f: { finding: Finding }) => f.finding.crap)).toEqual([210, 42]);
  });
});

describe('coverageOf', () => {
  it.each([
    // run, scripts/gate/run.mjs: CC 14, CRAP 210 = 14² + 14, no line covered.
    [{ cyclomatic: 14, crap: 210 }, 0],
    // BoardPane, estimated: CC 21, CRAP 116.3.
    [{ cyclomatic: 21, crap: 116.3 }, 40],
    // Fully covered: CRAP equals CC.
    [{ cyclomatic: 5, crap: 5 }, 100],
  ])('recovers the coverage behind %o as %i%%', (finding, percent) => {
    // Arrange: the finding is the table row.

    // Act
    const coverage = coverageOf(finding);

    // Assert
    expect(coverage).toBe(percent);
  });
});

describe('failureLines', () => {
  it('names path, function, CRAP, coverage and the frozen value, then the remedy', () => {
    // Arrange
    const failures = [
      {
        finding: {
          path: 'scripts/gate/run.mjs',
          name: 'run',
          line: 267,
          cyclomatic: 14,
          crap: 210,
          coverage_source: 'istanbul',
        },
        frozen: 200,
      },
      {
        finding: {
          path: 'apps/e2e/pages/link-preview.ts',
          name: 'parsePreview',
          line: 49,
          cyclomatic: 9,
          crap: 90,
          coverage_source: 'estimated',
        },
        frozen: null,
      },
    ];

    // Act
    const lines = failureLines(failures);

    // Assert
    expect(lines).toEqual([
      '✗ CRAP 30 exceeded by 2 function(s) new to it or above their frozen value',
      '    CRAP 210  coverage 0%  frozen at 200  run  (scripts/gate/run.mjs:267)',
      '    CRAP 90  coverage 0% (estimated)  not on the frozen list  parsePreview  (apps/e2e/pages/link-preview.ts:49)',
      '  Cover these functions with tests first; if one still scores 30 or more, extract helpers until it does not.',
    ]);
  });
});

describe('roundUp', () => {
  it.each([
    [210, 210],
    [71.3, 71.3],
    [116.3, 116.3],
    [30.01, 30.1],
    [53.249, 53.3],
  ])('rounds %d up to one decimal as %d', (crap, rounded) => {
    // Arrange: the CRAP is the table row.

    // Act
    const value = roundUp(crap);

    // Assert
    expect(value).toBe(rounded);
  });
});

describe('freezeList', () => {
  const found = (path: string, name: string, crap: number): Finding => ({
    path,
    name,
    line: 1,
    cyclomatic: 9,
    crap,
  });

  it('writes the first list from every offender, sorted by path then name, values rounded up', () => {
    // Arrange
    const offenders = [
      found('scripts/gate/run.mjs', 'run', 210),
      found('apps/e2e/pages/link-preview.ts', 'parsePreview', 90.01),
      found('scripts/gate/run.mjs', 'parse', 42),
    ];

    // Act
    const result = freezeList(offenders, null);

    // Assert
    expect(result).toEqual({
      list: [
        { path: 'apps/e2e/pages/link-preview.ts', name: 'parsePreview', crap: 90.1 },
        { path: 'scripts/gate/run.mjs', name: 'parse', crap: 42 },
        { path: 'scripts/gate/run.mjs', name: 'run', crap: 210 },
      ],
      refused: [],
    });
  });

  it('keeps the worst score when two functions share a path and a name', () => {
    // Arrange
    const offenders = [
      found('scripts/a.mjs', '<arrow>', 40),
      found('scripts/a.mjs', '<arrow>', 240),
    ];

    // Act
    const { list } = freezeList(offenders, null);

    // Assert
    expect(list).toEqual([{ path: 'scripts/a.mjs', name: '<arrow>', crap: 240 }]);
  });

  it('lowers a value and drops an entry whose function fell under 30', () => {
    // Arrange
    const frozen = [
      { path: 'scripts/a.mjs', name: 'f', crap: 90 },
      { path: 'scripts/a.mjs', name: 'g', crap: 60 },
    ];

    // Act
    const result = freezeList([found('scripts/a.mjs', 'f', 45)], frozen);

    // Assert
    expect(result).toEqual({
      list: [{ path: 'scripts/a.mjs', name: 'f', crap: 45 }],
      refused: [],
    });
  });

  it('keeps a value that did not move', () => {
    // Arrange
    const frozen = [{ path: 'scripts/a.mjs', name: 'f', crap: 71.3 }];

    // Act
    const result = freezeList([found('scripts/a.mjs', 'f', 71.3)], frozen);

    // Assert
    expect(result).toEqual({ list: frozen, refused: [] });
  });

  it('refuses to add a function the list does not hold', () => {
    // Arrange
    const frozen = [{ path: 'scripts/a.mjs', name: 'f', crap: 90 }];
    const offenders = [found('scripts/a.mjs', 'f', 90), found('scripts/b.mjs', 'h', 31)];

    // Act
    const { refused } = freezeList(offenders, frozen);

    // Assert
    expect(refused).toEqual([
      { entry: { path: 'scripts/b.mjs', name: 'h', crap: 31 }, frozen: null },
    ]);
  });

  it('refuses to raise a listed value, even by its rounding', () => {
    // Arrange
    const frozen = [{ path: 'scripts/a.mjs', name: 'f', crap: 90 }];

    // Act
    const { refused } = freezeList([found('scripts/a.mjs', 'f', 90.01)], frozen);

    // Assert
    expect(refused).toEqual([
      { entry: { path: 'scripts/a.mjs', name: 'f', crap: 90.1 }, frozen: 90 },
    ]);
  });

  it('refuses a list that was emptied, since nothing may be added to it', () => {
    // Arrange: a committed list with no entry left.

    // Act
    const { refused } = freezeList([found('scripts/a.mjs', 'f', 30)], []);

    // Assert
    expect(refused).toHaveLength(1);
  });
});

describe('freezeLines', () => {
  it('names each refused function and says what --freeze may do', () => {
    // Arrange
    const refused = [
      { entry: { path: 'scripts/b.mjs', name: 'h', crap: 31 }, frozen: null },
      { entry: { path: 'scripts/a.mjs', name: 'f', crap: 90.1 }, frozen: 90 },
    ];

    // Act
    const lines = freezeLines(refused);

    // Assert
    expect(lines).toEqual([
      '✗ crap --freeze refused: the frozen list only shrinks, and 2 function(s) would grow it',
      '    add  h  (scripts/b.mjs) at CRAP 31, not on the list',
      '    raise  f  (scripts/a.mjs) from 90 to 90.1',
      `  scripts/gate/crap-frozen.json is unchanged. --freeze may lower a value or drop an entry, never add or raise one; cover these functions with tests instead.`,
    ]);
  });
});

describe('readFrozen', () => {
  it('reads the committed list', () => {
    // Arrange
    const list = [{ path: 'scripts/gate/run.mjs', name: 'run', crap: 210 }];
    write('scripts/gate/crap-frozen.json', JSON.stringify(list));

    // Act
    const frozen = readFrozen(root);

    // Assert
    expect(frozen).toEqual(list);
  });

  it('reads a missing list as empty, so every offender is new', () => {
    // Arrange: no list on disk.

    // Act
    const frozen = readFrozen(root);

    // Assert
    expect(frozen).toEqual([]);
  });
});

describe('main', () => {
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;
  const stdout = () => log.mock.calls.map(([line]) => String(line)).join('\n');
  const stderr = () => error.mock.calls.map(([line]) => String(line)).join('\n');

  /** Every offender in `report`, frozen at its current value. */
  const freezeAll = (report: { findings: Finding[] }) =>
    write(
      'scripts/gate/crap-frozen.json',
      JSON.stringify(
        offenders(report).map((f: Finding) => ({
          path: f.path,
          name: f.name,
          crap: f.crap,
        })),
      ),
    );

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    write('vitest.sandcastle.config.mts');
    write('scripts/gate/run.mjs');
    writeMap('', ['scripts/gate/run.mjs']);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands fallow one merged map on this root, and exits 1 on a new offender', () => {
    // Arrange
    let seen: Record<string, unknown> = {};
    const fallow = (_root: string, coverage: string) => {
      seen = JSON.parse(readFileSync(coverage, 'utf8'));
      return fixtureText('measured');
    };

    // Act
    const code = main({ root, fallow });

    // Assert
    expect(Object.keys(seen)).toEqual([join(root, 'scripts/gate/run.mjs')]);
    expect(code).toBe(1);
    expect(stderr()).toContain('✗ CRAP 30 exceeded by 39 function(s)');
    expect(stderr()).toContain('not on the frozen list  run  (scripts/gate/run.mjs:267)');
  });

  it('passes when every offender is on the list at or under its value', () => {
    // Arrange
    const report = fixture('measured');
    freezeAll(report);

    // Act
    const code = main({ root, fallow: () => JSON.stringify(report) });

    // Assert
    expect(code).toBe(0);
    expect(stdout()).toBe(
      '✓ crap OK — 39 function(s) at CRAP 30 or more, each on the frozen list at or under its value.',
    );
  });

  it('fails a listed function that rose, naming its frozen value', () => {
    // Arrange
    const report = fixture('measured');
    freezeAll(report);
    const run = report.findings.find((f: Finding) => f.name === 'run');
    run.crap = 211;

    // Act
    const code = main({ root, fallow: () => JSON.stringify(report) });

    // Assert
    expect(code).toBe(1);
    expect(stderr()).toContain('CRAP 211  coverage 0%  frozen at 210  run');
  });

  it('fails loud with no coverage map, without running fallow', () => {
    // Arrange
    rmSync(join(root, 'coverage'), { recursive: true });
    const fallow = vi.fn();

    // Act
    const code = main({ root, fallow });

    // Assert
    expect(code).toBe(1);
    expect(fallow).not.toHaveBeenCalled();
    expect(stderr()).toBe(
      '✗ crap: no coverage map from 1 of 1 suite(s): coverage/coverage-final.json. ' +
        'Run the suites first: pnpm turbo run test && pnpm test:sandcastle.',
    );
  });

  it('fails loud when fallow scored on an estimate, even with nothing over 30', () => {
    // Arrange
    const report = fixture('no-map');
    freezeAll(report);

    // Act
    const code = main({ root, fallow: () => JSON.stringify(report) });

    // Assert
    expect(code).toBe(1);
    expect(stderr()).toMatch(/^✗ crap: fallow matched no file of the coverage map/);
  });
  describe('--freeze', () => {
    const listFile = () => join(root, 'scripts/gate/crap-frozen.json');
    const readList = () => JSON.parse(readFileSync(listFile(), 'utf8'));

    it('writes the first list from every offender, and says how many', () => {
      // Arrange
      const report = fixture('measured');

      // Act
      const code = main({ root, fallow: () => JSON.stringify(report), freeze: true });

      // Assert
      expect(code).toBe(0);
      expect(readList()).toHaveLength(39);
      expect(readList()).toContainEqual({
        path: 'scripts/gate/run.mjs',
        name: 'run',
        crap: 210,
      });
      expect(readFileSync(listFile(), 'utf8').endsWith(']\n')).toBe(true);
      expect(stdout()).toBe(
        '✓ crap --freeze wrote scripts/gate/crap-frozen.json: 39 function(s), was none.',
      );
    });

    it('rewrites the list lower when a listed function went down', () => {
      // Arrange
      const report = fixture('measured');
      freezeAll(report);
      report.findings.find((f: Finding) => f.name === 'run').crap = 14;

      // Act
      const code = main({ root, fallow: () => JSON.stringify(report), freeze: true });

      // Assert
      expect(code).toBe(0);
      expect(readList()).toHaveLength(38);
      expect(readList().map((e: { name: string }) => e.name)).not.toContain('run');
      expect(stdout()).toBe(
        '✓ crap --freeze wrote scripts/gate/crap-frozen.json: 38 function(s), was 39.',
      );
    });

    it('refuses a run that would add an entry, and leaves the list as it was', () => {
      // Arrange
      const report = fixture('measured');
      freezeAll(report);
      const before = readFileSync(listFile(), 'utf8');
      report.findings.push({
        path: 'scripts/gate/run.mjs',
        name: 'brandNew',
        line: 9,
        cyclomatic: 9,
        crap: 90,
        coverage_source: 'istanbul',
      });

      // Act
      const code = main({ root, fallow: () => JSON.stringify(report), freeze: true });

      // Assert
      expect(code).toBe(1);
      expect(readFileSync(listFile(), 'utf8')).toBe(before);
      expect(stderr()).toContain(
        '    add  brandNew  (scripts/gate/run.mjs) at CRAP 90, not on the list',
      );
    });

    it('refuses a run that would raise a value', () => {
      // Arrange
      const report = fixture('measured');
      freezeAll(report);
      report.findings.find((f: Finding) => f.name === 'run').crap = 211;

      // Act
      const code = main({ root, fallow: () => JSON.stringify(report), freeze: true });

      // Assert
      expect(code).toBe(1);
      expect(stderr()).toContain(
        '    raise  run  (scripts/gate/run.mjs) from 210 to 211',
      );
    });

    it('writes nothing when the coverage is not real', () => {
      // Arrange
      const report = fixture('no-map');

      // Act
      const code = main({ root, fallow: () => JSON.stringify(report), freeze: true });

      // Assert
      expect(code).toBe(1);
      expect(existsSync(listFile())).toBe(false);
    });
  });
});

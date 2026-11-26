import { describe, expect, it } from 'vitest';

import {
  codeValue,
  fileGroup,
  hasCoverageBlock,
  linesFloor,
} from '@/lib/collect/code.ts';

const UI_CONFIG = `export default mergeConfig(preset, defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['src/**'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
}));`;

const CONSOLE_CONFIG = `      // A FLOOR: lines: 99 in a comment is not a threshold
      thresholds: { statements: 93, branches: 87, functions: 92, lines: 94 },`;

const BLOG_CONFIG = `test: { include: ['__tests__/**/*.test.ts'], environment: 'node' }`;

describe('hasCoverageBlock', () => {
  it('finds a coverage block', () => {
    expect(hasCoverageBlock(UI_CONFIG)).toBe(true);
  });

  it('finds none in a config without one', () => {
    expect(hasCoverageBlock(BLOG_CONFIG)).toBe(false);
  });

  it('does not take a comment for a block', () => {
    expect(
      hasCoverageBlock('// coverage: { enabled: true } is what this would need'),
    ).toBe(false);
  });

  it('is not fooled by a glob string that looks like a block comment', () => {
    const config = `test: {
    include: ['__tests__/**/*.test.ts'],
    coverage: { enabled: true, include: ['lib/**/*.ts'] },
  }`;

    expect(hasCoverageBlock(config)).toBe(true);
  });

  it('reads a line comment holding a glob as one comment, not a block opening', () => {
    const config = `resolve: {
    // Mirrors tsconfig's "@/*": ["./*"]; vitest doesn't read tsconfig paths.
    alias: {},
  },
  test: { coverage: { enabled: true } }, // a trailing */ elsewhere`;

    expect(hasCoverageBlock(config)).toBe(true);
  });

  it('keeps a URL inside a string', () => {
    expect(
      hasCoverageBlock("const u = 'https://x.dev'; const c = { coverage: { on: 1 } };"),
    ).toBe(true);
  });

  it('skips a block comment that names a coverage block', () => {
    expect(hasCoverageBlock('/* coverage: { enabled: true } */ export default {};')).toBe(
      false,
    );
  });
});

describe('linesFloor', () => {
  it("reads the thresholds' lines value", () => {
    expect(linesFloor(CONSOLE_CONFIG)).toBe(94);
  });

  it('reads it in any key order', () => {
    expect(linesFloor(UI_CONFIG)).toBe(70);
  });

  it('is undefined without thresholds', () => {
    expect(linesFloor(BLOG_CONFIG)).toBeUndefined();
  });
});

// The shared hermetic config sets one floor per pseudo-workspace glob and no global
// one. Reading up to the first `}` gave all three the first glob's 26.
const SHARED_CONFIG = `thresholds: {
        // scripts/ measured 28.14 / 27.96 / 41.12 / 28.66.
        'scripts/**/*.mjs': { statements: 26, branches: 25, functions: 39, lines: 26 },
        '.sandcastle/**/*.mts': {
          statements: 59,
          branches: 68,
          functions: 56,
          lines: 58,
        },
        '.claude/skills/pixel-perfect-session/scripts/**/*.mjs': {
          statements: 61,
          branches: 43,
          functions: 54,
          lines: 61,
        },
      },`;

describe('linesFloor with a floor per glob', () => {
  it.each([
    ['scripts', 26],
    ['.sandcastle', 58],
    ['.claude/skills/pixel-perfect-session', 61],
  ])('reads %s its own glob floor, %i', (workspace, floor) => {
    // Arrange
    const config = SHARED_CONFIG;

    // Act
    const read = linesFloor(config, workspace);

    // Assert
    expect(read).toBe(floor);
  });

  it('is undefined for a workspace no glob names and no global floor', () => {
    expect(linesFloor(SHARED_CONFIG, 'apps/blog')).toBeUndefined();
  });

  it('does not take a glob floor for the global one', () => {
    expect(linesFloor(SHARED_CONFIG)).toBeUndefined();
  });

  it('prefers the global floor beside globs no glob of which names the workspace', () => {
    const config = `thresholds: { lines: 80, 'src/legacy/**': { lines: 10 } }`;
    expect(linesFloor(config, 'apps/x')).toBe(80);
  });
});

describe('fileGroup', () => {
  it('names a packages/ui file by its atomic tier', () => {
    expect(fileGroup('src/organisms/PanZoom/PanZoom.tsx')).toBe('organisms');
  });

  it('names any other file by its top folder', () => {
    expect(fileGroup('lib/jobs.ts')).toBe('lib');
  });

  it('gives a root file no group', () => {
    expect(fileGroup('proxy.ts')).toBeUndefined();
  });
});

const ROOT = '/repo/packages/ui';
const SUMMARY = {
  total: { lines: { total: 50, covered: 40, skipped: 0, pct: 80 } },
  [`${ROOT}/src/atoms/Badge/Badge.tsx`]: {
    lines: { total: 30, covered: 30, skipped: 0, pct: 100 },
  },
  [`${ROOT}/src/molecules/Card/Card.tsx`]: {
    lines: { total: 20, covered: 10, skipped: 0, pct: 50 },
  },
  '/repo/packages/other/x.ts': { lines: { total: 5, covered: 0, skipped: 0, pct: 0 } },
};

describe('codeValue', () => {
  it('relativises every file under the workspace and drops any outside it', () => {
    const value = codeValue(SUMMARY, ROOT, { untested: new Set(), scores: new Map() });

    expect(value.files.map((f) => f.path)).toEqual([
      'src/atoms/Badge/Badge.tsx',
      'src/molecules/Card/Card.tsx',
    ]);
  });

  it("sums the workspace's own files rather than trusting the summary total", () => {
    const value = codeValue(SUMMARY, ROOT, { untested: new Set(), scores: new Map() });

    expect(value.lines).toEqual({ covered: 40, total: 50, pct: 80 });
  });

  it('rounds each percentage to one decimal from its counts', () => {
    const summary = {
      [`${ROOT}/a.ts`]: { lines: { total: 353, covered: 349, skipped: 0, pct: 98.86 } },
    };

    const value = codeValue(summary, ROOT, { untested: new Set(), scores: new Map() });

    expect(value.files[0]?.lines.pct).toBe(98.9);
  });

  it('carries the floor, the group and the fallow scores of each file', () => {
    const scores = new Map([
      ['src/atoms/Badge/Badge.tsx', { maintainability: 92.1, crap: 2 }],
    ]);

    const value = codeValue(SUMMARY, ROOT, { floor: 70, untested: new Set(), scores });

    expect(value.floor).toBe(70);
    expect(value.files[0]).toEqual({
      path: 'src/atoms/Badge/Badge.tsx',
      group: 'atoms',
      lines: { covered: 30, total: 30, pct: 100 },
      maintainability: 92.1,
      crap: 2,
    });
  });

  it('marks a file with no covered lines that a test ran as a process', () => {
    const summary = {
      [`${ROOT}/scripts/run.mjs`]: { lines: { total: 12, covered: 0 } },
      [`${ROOT}/scripts/lock.mjs`]: { lines: { total: 8, covered: 0 } },
    };
    const asProcess = new Set(['scripts/run.mjs']);

    const value = codeValue(summary, ROOT, {
      untested: new Set(),
      scores: new Map(),
      asProcess,
    });

    expect(value.files).toEqual([
      {
        path: 'scripts/lock.mjs',
        group: 'scripts',
        lines: { covered: 0, total: 8, pct: 0 },
      },
      {
        path: 'scripts/run.mjs',
        group: 'scripts',
        lines: { covered: 0, total: 12, pct: 0 },
        testedAsProcess: true,
      },
    ]);
    expect(value.lines).toEqual({ covered: 0, total: 20, pct: 0 });
  });

  it('never marks a file vitest already covers, even when a child ran it too', () => {
    const asProcess = new Set(['src/molecules/Card/Card.tsx']);

    const value = codeValue(SUMMARY, ROOT, {
      untested: new Set(),
      scores: new Map(),
      asProcess,
    });

    expect(value.files[1]).not.toHaveProperty('testedAsProcess');
  });

  it('counts static reach as the share of files fallow finds a test reaching', () => {
    const untested = new Set(['src/molecules/Card/Card.tsx']);

    const value = codeValue(SUMMARY, ROOT, { untested, scores: new Map() });

    expect(value.staticReachPct).toBe(50);
  });
});

describe('hasCoverageBlock at the edges of a file', () => {
  it('ends a line comment at the end of the file', () => {
    expect(hasCoverageBlock('const c = { coverage: { on: 1 } }; // last line')).toBe(
      true,
    );
  });

  it('takes an unterminated block comment to the end of the file', () => {
    expect(hasCoverageBlock('const a = 1; /* coverage: { on: 1 }')).toBe(false);
  });

  it('reads past an escaped quote inside a string', () => {
    expect(
      hasCoverageBlock("const s = 'it\\'s /*'; const c = { coverage: { on: 1 } };"),
    ).toBe(true);
  });
});

describe('codeValue edge cases', () => {
  it('sorts files by path whatever order the summary lists them in', () => {
    const summary = {
      [`${ROOT}/src/b.ts`]: { lines: { total: 1, covered: 1 } },
      [`${ROOT}/src/a.ts`]: { lines: { total: 1, covered: 1 } },
    };

    const value = codeValue(summary, ROOT, { untested: new Set(), scores: new Map() });

    expect(value.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('calls a workspace with no lines to cover fully covered and fully reached', () => {
    const value = codeValue({}, ROOT, { untested: new Set(), scores: new Map() });

    expect(value).toMatchObject({
      lines: { covered: 0, total: 0, pct: 100 },
      staticReachPct: 100,
    });
  });
});

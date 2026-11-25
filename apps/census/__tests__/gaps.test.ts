import { describe, expect, it } from 'vitest';

import { deriveGaps, gapId, type VisualSubjects } from '@/lib/gaps.ts';
import type { DimensionValue, Workspace } from '@/lib/measurement.ts';

const notApplicable = (dimension: DimensionValue['dimension']): DimensionValue =>
  ({ dimension, state: 'not-applicable', reason: 'n/a' }) as DimensionValue;

const NONE: VisualSubjects = { incomplete: [], unstoried: [], routes: [] };

/** A workspace with every dimension not applicable; each test lights the one it needs. */
function workspace(
  name: string,
  path: string,
  dimensions: Partial<Workspace['dimensions']> = {},
): Workspace {
  return {
    name,
    path,
    category: path.startsWith('apps/') ? 'apps' : 'packages',
    dimensions: {
      code: notApplicable('code'),
      visual: notApplicable('visual'),
      acceptance: notApplicable('acceptance'),
      health: notApplicable('health'),
      ...dimensions,
    } as Workspace['dimensions'],
  };
}

const measuredCode = (
  files: { path: string; covered: number; total: number; testedAsProcess?: true }[],
) =>
  ({
    dimension: 'code',
    state: 'measured',
    lines: { covered: 1, total: 1, pct: 100 },
    staticReachPct: 100,
    files: files.map((f) => ({
      path: f.path,
      lines: { covered: f.covered, total: f.total, pct: 0 },
      ...(f.testedAsProcess ? { testedAsProcess: f.testedAsProcess } : {}),
    })),
  }) as const;

const acceptance = (scenarios: number): Workspace['dimensions']['acceptance'] => ({
  dimension: 'acceptance',
  state: 'measured',
  scenarios,
  features: [],
});

describe('gapId', () => {
  it('omits the subject when it is the workspace itself', () => {
    const id = gapId('app-unvisited', 'apps/manual');

    expect(id).toBe('app-unvisited:apps/manual');
  });

  it('appends the subject after the workspace path', () => {
    const id = gapId('uncovered-file', 'apps/manual', 'lib/sources.ts');

    expect(id).toBe('uncovered-file:apps/manual:lib/sources.ts');
  });
});

describe('deriveGaps', () => {
  describe('unmeasured-workspace', () => {
    it('is a gap when the Code dimension is unmeasured', () => {
      const blog = workspace('@gate/blog', 'apps/blog', {
        code: { dimension: 'code', state: 'unmeasured', reason: 'No coverage block' },
      });

      const gaps = deriveGaps([blog], {});

      expect(gaps).toEqual([
        {
          id: 'unmeasured-workspace:apps/blog',
          dimension: 'code',
          workspace: '@gate/blog',
          kind: 'unmeasured-workspace',
          subject: 'apps/blog',
          title: '@gate/blog: measure coverage',
        },
      ]);
    });

    it('is no gap when the Code dimension is measured', () => {
      const ui = workspace('@gate/ui', 'packages/ui', { code: measuredCode([]) });

      const gaps = deriveGaps([ui], {});

      expect(gaps).toEqual([]);
    });
  });

  describe('uncovered-file', () => {
    it('is a gap for a file with lines and none covered', () => {
      const manual = workspace('@gate/manual', 'apps/manual', {
        code: measuredCode([{ path: 'lib/sources.ts', covered: 0, total: 12 }]),
      });

      const gaps = deriveGaps([manual], {});

      expect(gaps).toEqual([
        {
          id: 'uncovered-file:apps/manual:lib/sources.ts',
          dimension: 'code',
          workspace: '@gate/manual',
          kind: 'uncovered-file',
          subject: 'lib/sources.ts',
          title: '@gate/manual: lib/sources.ts has no test',
        },
      ]);
    });

    it('is no gap for a file its tests run as a process', () => {
      const scripts = workspace('scripts', 'scripts', {
        code: measuredCode([
          { path: 'gate/run.mjs', covered: 0, total: 40, testedAsProcess: true },
        ]),
      });

      const gaps = deriveGaps([scripts], {});

      expect(gaps).toEqual([]);
    });

    it('is still a gap for an uncovered file beside one tested as a process', () => {
      const scripts = workspace('scripts', 'scripts', {
        code: measuredCode([
          { path: 'gate/run.mjs', covered: 0, total: 40, testedAsProcess: true },
          { path: 'gate/other.mjs', covered: 0, total: 9 },
        ]),
      });

      const gaps = deriveGaps([scripts], {});

      expect(gaps.map((gap) => gap.id)).toEqual([
        'uncovered-file:scripts:gate/other.mjs',
      ]);
    });

    it('is no gap for a file under its floor but above zero', () => {
      const manual = workspace('@gate/manual', 'apps/manual', {
        code: measuredCode([{ path: 'lib/sources.ts', covered: 1, total: 12 }]),
      });

      const gaps = deriveGaps([manual], {});

      expect(gaps).toEqual([]);
    });

    it('is no gap for a file with no lines to cover', () => {
      const manual = workspace('@gate/manual', 'apps/manual', {
        code: measuredCode([{ path: 'lib/types.ts', covered: 0, total: 0 }]),
      });

      const gaps = deriveGaps([manual], {});

      expect(gaps).toEqual([]);
    });
  });

  describe('component-incomplete', () => {
    it('is one gap per story, naming everything it lacks', () => {
      const blog = workspace('@gate/blog', 'apps/blog');
      const subjects = {
        'apps/blog': {
          ...NONE,
          incomplete: [
            { storyId: 'screens-blog-about--default', missing: ['tile'] as const },
          ],
        },
      };

      const gaps = deriveGaps([blog], subjects);

      expect(gaps).toEqual([
        {
          id: 'component-incomplete:apps/blog:screens-blog-about--default',
          dimension: 'visual',
          workspace: '@gate/blog',
          kind: 'component-incomplete',
          subject: 'screens-blog-about--default',
          title: 'screens-blog-about--default: no tile',
        },
      ]);
    });

    it('joins several missing parts into one title', () => {
      const ui = workspace('@gate/ui', 'packages/ui');
      const subjects = {
        'packages/ui': {
          ...NONE,
          incomplete: [
            { storyId: 'atoms-meter--full', missing: ['tile', 'baseline'] as const },
          ],
        },
      };

      const [gap] = deriveGaps([ui], subjects);

      expect(gap?.title).toBe('atoms-meter--full: no tile, no baseline');
    });

    it('is no gap for a story with nothing missing', () => {
      const ui = workspace('@gate/ui', 'packages/ui');
      const subjects = {
        'packages/ui': {
          ...NONE,
          incomplete: [{ storyId: 'atoms-badge--accent', missing: [] }],
        },
      };

      const gaps = deriveGaps([ui], subjects);

      expect(gaps).toEqual([]);
    });
  });

  describe('story-missing', () => {
    it('is a gap for each component no story imports', () => {
      const console_ = workspace('@gate/visual-diff-ui', 'apps/visual-diff-ui');
      const subjects = { 'apps/visual-diff-ui': { ...NONE, unstoried: ['JobRow'] } };

      const gaps = deriveGaps([console_], subjects);

      expect(gaps).toEqual([
        {
          id: 'story-missing:apps/visual-diff-ui:JobRow',
          dimension: 'visual',
          workspace: '@gate/visual-diff-ui',
          kind: 'story-missing',
          subject: 'JobRow',
          title: '@gate/visual-diff-ui: JobRow has no story',
        },
      ]);
    });
  });

  describe('route-state-missing', () => {
    it('is one gap per state a route has neither own nor inherited', () => {
      const blog = workspace('@gate/blog', 'apps/blog');
      const subjects = {
        'apps/blog': {
          ...NONE,
          routes: [
            {
              route: '/tag/[tag]',
              loading: 'none',
              error: 'inherited',
              notFound: 'none',
            },
          ] as const,
        },
      };

      const gaps = deriveGaps([blog], subjects);

      expect(gaps.map((g) => [g.id, g.title])).toEqual([
        [
          'route-state-missing:apps/blog:/tag/[tag]:loading',
          '@gate/blog: /tag/[tag] has no loading state',
        ],
        [
          'route-state-missing:apps/blog:/tag/[tag]:not-found',
          '@gate/blog: /tag/[tag] has no not-found state',
        ],
      ]);
    });

    it('is no gap for a route that inherits every state', () => {
      const blog = workspace('@gate/blog', 'apps/blog');
      const subjects = {
        'apps/blog': {
          ...NONE,
          routes: [
            { route: '/', loading: 'own', error: 'inherited', notFound: 'inherited' },
          ] as const,
        },
      };

      const gaps = deriveGaps([blog], subjects);

      expect(gaps).toEqual([]);
    });
  });

  describe('app-unvisited', () => {
    it('is a gap for a deployed app no scenario visits', () => {
      const manual = workspace('@gate/manual', 'apps/manual', {
        acceptance: acceptance(0),
      });

      const gaps = deriveGaps([manual], {});

      expect(gaps).toEqual([
        {
          id: 'app-unvisited:apps/manual',
          dimension: 'acceptance',
          workspace: '@gate/manual',
          kind: 'app-unvisited',
          subject: 'apps/manual',
          title: '@gate/manual: no acceptance scenario',
        },
      ]);
    });

    it('is no gap for a workspace that is not a deployed app', () => {
      const e2e = workspace('@gate/e2e', 'apps/e2e', { acceptance: acceptance(0) });

      const gaps = deriveGaps([e2e], {});

      expect(gaps).toEqual([]);
    });

    it('is no gap for an app at least one scenario visits', () => {
      const blog = workspace('@gate/blog', 'apps/blog', { acceptance: acceptance(27) });

      const gaps = deriveGaps([blog], {});

      expect(gaps).toEqual([]);
    });
  });

  describe('not-applicable and Health', () => {
    it('never yields a gap from a not-applicable dimension', () => {
      const tsconfig = workspace('@gate/tsconfig', 'packages/tsconfig');

      const gaps = deriveGaps([tsconfig], {});

      expect(gaps).toEqual([]);
    });

    it('never yields a gap from Health, however low', () => {
      const scripts = workspace('scripts/', 'scripts', {
        health: {
          dimension: 'health',
          state: 'measured',
          score: 12,
          grade: 'F',
          overCeiling: 3,
          deadFiles: 4,
          deadExports: 9,
          refactorTargets: 5,
        },
      });

      const gaps = deriveGaps([scripts], {});

      expect(gaps).toEqual([]);
    });
  });

  it('yields unique ids across every kind and workspace', () => {
    const blog = workspace('@gate/blog', 'apps/blog', {
      code: { dimension: 'code', state: 'unmeasured', reason: 'No coverage block' },
      acceptance: acceptance(0),
    });
    const manual = workspace('@gate/manual', 'apps/manual', {
      acceptance: acceptance(0),
    });
    const subjects = {
      'apps/blog': {
        incomplete: [
          { storyId: 'screens-blog-home--latest', missing: ['tile'] as const },
        ],
        unstoried: ['PostCard'],
        routes: [
          { route: '/', loading: 'none', error: 'none', notFound: 'none' },
        ] as const,
      },
    };

    const ids = deriveGaps([blog, manual], subjects).map((g) => g.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, it } from 'vitest';

import {
  fileFacts,
  repositoryHealth,
  workspaceHealth,
  type FallowReports,
} from '@/lib/collect/health.ts';

/** The fields census reads from fallow 3.36.0's JSON, trimmed to a repository of three files. */
const REPORTS: FallowReports = {
  health: {
    summary: { coverage_model: 'istanbul' },
    health_score: {
      score: 84.8,
      grade: 'B',
      penalties: { dead_files: 1.2, unit_size: 10, complexity: 0, coupling: 1.7 },
    },
    vital_signs: {
      duplication_pct: 1.6,
      counts: { total_files: 991, total_exports: 2289 },
      unit_size_profile: {
        low_risk: 83.7,
        medium_risk: 9.1,
        high_risk: 4.4,
        very_high_risk: 2.8,
      },
      unit_interfacing_profile: {
        low_risk: 97.6,
        medium_risk: 2.3,
        high_risk: 0.1,
        very_high_risk: 0,
      },
    },
    file_scores: [
      {
        path: 'scripts/board.mjs',
        maintainability_index: 60.2,
        crap_max: 240,
        crap_above_threshold: 3,
        total_cognitive: 90,
      },
      {
        path: 'packages/ui/src/atoms/Badge/Badge.tsx',
        maintainability_index: 92.1,
        crap_max: 2,
        crap_above_threshold: 0,
        total_cognitive: 4,
      },
    ],
    hotspots: [{ path: 'scripts/board.mjs', score: 43.9, commits: 13 }],
    targets: [
      {
        path: 'scripts/board.mjs',
        priority: 35,
        effort: 'medium',
        recommendation: 'Remove 5 unused exports to reduce surface area (100% dead)',
      },
    ],
    coverage_gaps: { files: [{ path: 'scripts/board.mjs' }] },
    styling_health: {
      score: 98.7,
      grade: 'A',
      penalties: { duplication: 1, dead_surface: 0.3, broken_references: 0 },
    },
    styling_findings: [
      { code: 'css-token-drift' },
      { code: 'css-duplicate-block' },
      { code: 'css-selector-complexity', sub_kind: 'complex-selector' },
      { code: 'css-selector-complexity', sub_kind: 'complex-selector' },
      { code: 'css-selector-complexity', sub_kind: 'important-density' },
    ],
    css_analytics: {
      files: [
        { analytics: { important_declarations: 2 } },
        { analytics: { important_declarations: 1 } },
      ],
    },
  },
  complexity: { findings: [{ path: 'scripts/board.mjs', cognitive: 32 }] },
  dead: {
    summary: {
      unused_files: 2,
      unused_exports: 5,
      unused_types: 1,
      unlisted_dependencies: 1,
      circular_dependencies: 0,
    },
    unused_files: [{ path: 'scripts/old.mjs' }, { path: '.sandcastle/old.mts' }],
    unused_exports: [{ path: 'scripts/board.mjs' }, { path: 'packages/ui/src/index.ts' }],
  },
  boundaries: { boundaries: { configured: false } },
  dupesMild: {
    stats: { duplication_percentage: 1.5931, duplicated_lines: 958, clone_groups: 18 },
  },
  dupesSemantic: {
    stats: { duplication_percentage: 6.8614, duplicated_lines: 4126, clone_groups: 133 },
  },
  groups: {
    '@gate/ui': {
      score: 89.3,
      grade: 'A',
      penalties: { dead_exports: 0.1, complexity: 0, unit_size: 10, coupling: 0.6 },
    },
    scripts: { score: 72.5, grade: 'B', penalties: {} },
  },
};

describe('repositoryHealth', () => {
  it("carries fallow's score and grade, and every penalty above zero, largest first", () => {
    const health = repositoryHealth(REPORTS);

    expect(health).toMatchObject({ score: 84.8, grade: 'B' });
    expect(health.penalties).toEqual([
      { name: 'unit size', points: 10 },
      { name: 'coupling', points: 1.7 },
      { name: 'dead files', points: 1.2 },
    ]);
  });

  it('counts dead code from the dead-code summary', () => {
    const health = repositoryHealth(REPORTS);

    expect(health.dead).toEqual({
      files: 2,
      exports: 5,
      types: 1,
      unlistedDeps: 1,
      cycles: 0,
      totalFiles: 991,
      totalExports: 2289,
      boundaries: false,
    });
  });

  it('reads duplication in both modes, rounded to one decimal', () => {
    const health = repositoryHealth(REPORTS);

    expect(health.duplication).toEqual({
      semanticPct: 6.9,
      mildPct: 1.6,
      lines: 958,
      groups: 18,
    });
  });

  it('counts styling findings by code and !important declarations from the analytics', () => {
    const health = repositoryHealth(REPORTS);

    expect(health.styling).toEqual({
      score: 98.7,
      grade: 'A',
      tokenDrift: 1,
      duplicateBlocks: 1,
      complexSelectors: 2,
      important: 3,
      penalties: [
        { name: 'duplication', points: 1 },
        { name: 'dead surface', points: 0.3 },
        { name: 'broken references', points: 0 },
      ],
    });
  });

  it('plots a hotspot by its commits against its total cognitive complexity', () => {
    const health = repositoryHealth(REPORTS);

    expect(health.hotspots).toEqual([
      { path: 'scripts/board.mjs', churn: 13, complexity: 90 },
    ]);
  });

  it("keeps each refactor target with fallow's recommendation", () => {
    const health = repositoryHealth(REPORTS);

    expect(health.refactorTargets).toEqual([
      {
        path: 'scripts/board.mjs',
        priority: 35,
        effort: 'medium',
        recommendation: 'Remove 5 unused exports to reduce surface area (100% dead)',
      },
    ]);
  });

  it('reads the profiles in risk order, low to very high', () => {
    const health = repositoryHealth(REPORTS);

    expect(health.profiles).toEqual({
      unitSize: [83.7, 9.1, 4.4, 2.8],
      interfacing: [97.6, 2.3, 0.1, 0],
    });
  });

  it('sums the functions at or over CRAP 30 and says the coverage was measured', () => {
    const health = repositoryHealth(REPORTS);

    expect(health).toMatchObject({ crapOver30: 3, crapSource: 'measured' });
  });

  it('says CRAP is estimated when fallow had no coverage', () => {
    const reports = {
      ...REPORTS,
      health: { ...REPORTS.health, summary: { coverage_model: 'static_estimated' } },
    };

    const health = repositoryHealth(reports);

    expect(health.crapSource).toBe('estimated');
  });
});

describe('workspaceHealth', () => {
  it('scores a package from its fallow group and counts what falls under its path', () => {
    const value = workspaceHealth(REPORTS, { name: '@gate/ui', path: 'packages/ui' });

    expect(value).toEqual({
      dimension: 'health',
      state: 'measured',
      score: 89.3,
      grade: 'A',
      overCeiling: 0,
      deadFiles: 0,
      deadExports: 1,
      refactorTargets: 0,
      // Largest first, the free ones left out.
      penalties: [
        { name: 'unit size', points: 10 },
        { name: 'coupling', points: 0.6 },
        { name: 'dead exports', points: 0.1 },
      ],
    });
  });

  it('scores a pseudo-workspace from its directory group', () => {
    const value = workspaceHealth(REPORTS, { name: 'scripts/', path: 'scripts' });

    expect(value).toMatchObject({
      score: 72.5,
      overCeiling: 1,
      deadFiles: 1,
      deadExports: 1,
      refactorTargets: 1,
    });
  });

  it('is not applicable for a workspace fallow scored no file of', () => {
    const value = workspaceHealth(REPORTS, {
      name: '@gate/tsconfig',
      path: 'packages/tsconfig',
    });

    expect(value).toEqual({
      dimension: 'health',
      state: 'not-applicable',
      reason: 'No source file for fallow to score',
    });
  });

  it('does not count a sibling whose path only starts the same', () => {
    const value = workspaceHealth(
      {
        ...REPORTS,
        groups: {
          ...REPORTS.groups,
          '@gate/u': { score: 90, grade: 'A', penalties: {} },
        },
      },
      { name: '@gate/u', path: 'packages/u' },
    );

    expect(value).toMatchObject({ deadExports: 0 });
  });
});

describe('fileFacts', () => {
  it("gives a workspace's file scores and untested files relative to it", () => {
    const facts = fileFacts(REPORTS, 'scripts');

    expect(facts.scores).toEqual(
      new Map([['board.mjs', { maintainability: 60.2, crap: 240 }]]),
    );
    expect(facts.untested).toEqual(new Set(['board.mjs']));
  });
});

describe('repositoryHealth edge cases', () => {
  it('ranks hotspots by fallow score, highest first', () => {
    const reports = {
      ...REPORTS,
      health: {
        ...REPORTS.health,
        hotspots: [
          { path: 'a.mjs', score: 10, commits: 2 },
          { path: 'scripts/board.mjs', score: 43.9, commits: 13 },
        ],
      },
    };

    const health = repositoryHealth(reports);

    expect(health.hotspots.map((h) => h.path)).toEqual(['scripts/board.mjs', 'a.mjs']);
  });

  it('gives a hotspot fallow did not score a complexity of zero', () => {
    const reports = {
      ...REPORTS,
      health: {
        ...REPORTS.health,
        hotspots: [{ path: 'unscored.mjs', score: 1, commits: 1 }],
      },
    };

    const health = repositoryHealth(reports);

    expect(health.hotspots).toEqual([{ path: 'unscored.mjs', churn: 1, complexity: 0 }]);
  });

  it('leaves styling out when fallow had no CSS to score', () => {
    const {
      styling_health: _s,
      styling_findings: _f,
      css_analytics: _c,
      ...rest
    } = REPORTS.health;

    const health = repositoryHealth({ ...REPORTS, health: rest });

    expect(health.styling).toBeUndefined();
  });

  it('counts styling with no findings and no analytics as zero', () => {
    const { styling_findings: _f, css_analytics: _c, ...rest } = REPORTS.health;

    const health = repositoryHealth({ ...REPORTS, health: rest });

    expect(health.styling).toMatchObject({ tokenDrift: 0, important: 0 });
  });
});

describe('workspaceHealth edge cases', () => {
  it('is not applicable when fallow grades outside A–F', () => {
    const value = workspaceHealth(
      { ...REPORTS, groups: { '@gate/ui': { score: 50, grade: 'E', penalties: {} } } },
      { name: '@gate/ui', path: 'packages/ui' },
    );

    expect(value.state).toBe('not-applicable');
  });
});

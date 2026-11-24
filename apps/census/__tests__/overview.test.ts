import { describe, expect, it } from 'vitest';

import type { History, Measurement, Workspace } from '@/lib/measurement.ts';
import {
  complexityTree,
  gapsMarkdown,
  heat,
  kilo,
  overviewOf,
  signed,
} from '@/lib/overview.ts';
import { sample } from './sample';

const { measurement, history } = sample();
const view = overviewOf(measurement, history);

describe('overviewOf the sample: the figures at the top', () => {
  it('rows each dimension at its latest history value, with its 30-day delta', () => {
    expect(view.coverage.map((r) => [r.name, r.value, r.delta, r.detail])).toEqual([
      ['Code', 31, 7, 'lines covered · 93.7% of files reached by a test'],
      ['Visual', 76, 7, '52 of 64 with story · tile · baseline'],
      ['Acceptance', 50, 25, '2 of 4 apps a scenario visits'],
      ['Health', 90.9, 9.1, '10 of 11 scopes under the complexity ceiling'],
    ]);
  });

  it('tables the same figures, with the counts measured now', () => {
    expect(
      view.metrics.map((r) => [
        r.dimension,
        r.metric,
        r.value,
        r.unit,
        r.change,
        r.period,
      ]),
    ).toEqual([
      ['Code', 'lines covered', '31', '%', '+7 pts', '30 d'],
      ['Visual', 'story · tile · baseline', '52 / 64', 'components', '+7 pts', '30 d'],
      ['Acceptance', 'apps visited', '2 / 4', 'apps', '+25 pts', '30 d'],
      ['Health', 'scopes under the ceiling', '10 / 11', 'scopes', '+9.1 pts', '30 d'],
      ['Health', 'fallow score', '84.7', 'of 100', '+2.1', '30 d'],
      ['Visual', 'components without a story', '21 / 65', 'components', '—', 'now'],
      ['Visual', 'routes without loading', '13 / 17', 'routes', '—', 'now'],
    ]);
  });

  it('draws the pyramid base first, with the ratio of its ends', () => {
    expect(view.pyramid.bands.map((b) => b.count)).toEqual([3550, 286, 88]);
    expect(view.pyramid.caption).toBe('Log scale · 40× more vitest cases than scenarios');
  });

  it('counts gaps per dimension, Health included at zero', () => {
    expect(view.gapPills.gaps.map((g) => [g.label, g.count])).toEqual([
      ['code', 9],
      ['visual', 46],
      ['accept.', 2],
      ['health', 0],
    ]);
    expect(view.gapPills.caption).toBe('57 gaps, each one an issue to file.');
  });
});

describe('overviewOf the sample: stories and screen states', () => {
  it('lists each workspace missing stories, named from its gaps', () => {
    expect(view.stories.unstoried).toBe(21);
    expect(view.stories.total).toBe(65);
    expect(
      view.stories.workspaces.map((w) => [w.name, w.total, w.missing.length]),
    ).toEqual([
      ['@gate/ui', 31, 1],
      ['@gate/visual-diff-ui', 19, 14],
      ['@gate/blog', 11, 5],
      ['@gate/manual', 4, 1],
    ]);
  });

  it('sums the three route states and names the routes without loading', () => {
    expect(view.states.caption).toBe(
      "Next.js route files across 17 routes in console, blog and manual. error and not-found are inherited from each app's root.",
    );
    expect(view.states.pies[0]).toEqual({
      name: 'loading',
      own: 3,
      inherited: 1,
      none: 13,
    });
    expect(view.states.heading).toBe('13 routes without loading');
    expect(view.states.withoutLoading.find((w) => w.app === 'console')).toEqual({
      app: 'console',
      routes: [
        '/',
        '/report/[id]',
        '/report/[id]/compare/[key]',
        '/set/[label]',
        '/set/[label]/shot/[key]',
      ],
    });
  });
});

describe('overviewOf the sample: health', () => {
  it('scores the repository with its source and its 30-day delta', () => {
    expect(view.health).toMatchObject({
      score: 84.7,
      grade: 'B',
      delta: 2.1,
      source: 'of 100 · fallow 3.36.0',
    });
  });

  it("draws the tile's four panels, in its order", () => {
    expect(
      view.health.sparks.map((s) => [
        s.label,
        s.value,
        s.delta,
        s.better,
        s.series.length,
      ]),
    ).toEqual([
      ['CRAP ≥ 30', '7', -3, 'down', 11],
      ['Over ceiling', '3', -1, 'down', 11],
      ['Duplication', '1.6%', -0.4, 'down', 11],
      ['Dead files', '49', undefined, 'down', 0],
    ]);
  });

  it('reads the semantic duplication beside the mild figure, and nowhere else', () => {
    expect(view.health.sparks.map((s) => s.aside)).toEqual([
      undefined,
      undefined,
      '6.9% semantic',
      undefined,
    ]);
  });

  it('draws dead files over time from the points that recorded them', () => {
    const { measurement, history } = sample();
    const counts = new Map([
      [8, 53],
      [9, 51],
      [10, 49],
    ]);
    const recorded: History = {
      ...history,
      points: history.points.map((p, i) => ({
        ...p,
        fallow: { ...p.fallow, deadFiles: counts.get(i) },
      })),
    };

    const dead = overviewOf(measurement, recorded).health.sparks.at(-1);

    expect(dead).toMatchObject({ value: '49', series: [53, 51, 49] });
    expect(dead?.delta).toBeUndefined();
  });

  it('compares dead files with the point 30 days back when it recorded them', () => {
    const { measurement, history } = sample();
    const recorded: History = {
      ...history,
      points: history.points.map((p, i, all) => ({
        ...p,
        fallow: { ...p.fallow, deadFiles: i === all.length - 1 ? 49 : 53 },
      })),
    };

    const dead = overviewOf(measurement, recorded).health.sparks.at(-1);

    expect(dead?.delta).toBe(-4);
  });

  it('lists dead code and the styling findings', () => {
    expect(view.dead.rows.map((d) => d.value)).toEqual(['49', '76', '2', '2', '0']);
    expect(view.styling?.findings.map((f) => f.value)).toEqual(['1', '4', '71', '1']);
    expect(view.styling?.source).toBe('of 100 · fallow 3.36.0');
  });

  it('labels what costs styling points, the free ones kept for the note', () => {
    const { measurement, history } = sample();
    Object.assign(measurement.health.styling!, {
      penalties: [
        { name: 'duplication', points: 1 },
        { name: 'dead surface', points: 0.3 },
        { name: 'broken references', points: 0 },
        { name: 'token erosion', points: 0 },
        { name: 'structural', points: 0 },
      ],
    });

    const styling = overviewOf(measurement, history).styling;

    expect(styling?.penalties).toEqual([
      { name: 'Duplication', points: 1 },
      { name: 'Dead surface', points: 0.3 },
      { name: 'Broken references', points: 0 },
      { name: 'Token erosion', points: 0 },
      { name: 'Structure', points: 0 },
    ]);
  });

  it('has no styling penalties when the measurement recorded none', () => {
    const { measurement, history } = sample();
    delete measurement.health.styling!.penalties;

    const styling = overviewOf(measurement, history).styling;

    expect(styling?.penalties).toEqual([]);
  });

  it('gives unused files and exports their share of what was measured', () => {
    const { measurement, history } = sample();
    Object.assign(measurement.health.dead, { totalFiles: 822, totalExports: 1752 });

    const rows = overviewOf(measurement, history).dead.rows;

    expect(rows.slice(0, 2)).toEqual([
      { name: 'Unused files', detail: '49 of 822', value: '6%', share: 6 },
      { name: 'Unused exports', detail: '76 of 1,752', value: '4.3%', share: 4.3 },
    ]);
    expect(rows.slice(2).map((r) => r.share)).toEqual([undefined, undefined, undefined]);
  });

  it('keeps the plain count when the measurement recorded no total', () => {
    const rows = view.dead.rows;

    expect(rows[0]).toEqual({
      name: 'Unused files',
      detail: 'files nothing imports',
      value: '49',
    });
    expect(rows[1]).toEqual({
      name: 'Unused exports',
      detail: 'exports nothing imports',
      value: '76',
    });
  });

  it('keeps the plain count when there was nothing to take a share of', () => {
    const { measurement, history } = sample();
    Object.assign(measurement.health.dead, { files: 0, totalFiles: 0 });

    const row = overviewOf(measurement, history).dead.rows[0];

    expect(row).toEqual({
      name: 'Unused files',
      detail: 'files nothing imports',
      value: '0',
    });
  });

  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ])('reads boundaries recorded as %s as configured: %s', (recorded, configured) => {
    const { measurement, history } = sample();
    Object.assign(measurement.health.dead, { boundaries: recorded });

    const { dead } = overviewOf(measurement, history);

    expect(dead.boundariesConfigured).toBe(configured);
  });

  it('marks the hotspots that are refactor targets, and shows the top five targets', () => {
    expect(view.hotspots.dots.filter((d) => d.hot).map((d) => d.path)).toEqual([
      'board-scale-integrity.mjs',
      'policy.test.mjs',
      'comparison.ts',
    ]);
    expect(view.hotspots.targets.map((t) => t.priority)).toEqual([
      35, 32.5, 32.4, 29.4, 27.5,
    ]);
    expect(view.hotspots.targetCount).toBe(9);
    expect(view.hotspots.targets[0]?.href).toMatch(
      /\/blob\/0514dc9a[0-9a-f]+\/scripts\/pen\/place-tiles\.js$/,
    );
  });

  it('labels a crowded dot on its left', () => {
    expect(view.hotspots.dots.filter((d) => d.hot).map((d) => [d.path, d.label])).toEqual(
      [
        ['board-scale-integrity.mjs', 'end'],
        ['policy.test.mjs', 'start'],
        ['comparison.ts', 'end'],
      ],
    );
  });

  it('folds the hotspots into workspace and folder, top-level files under (root)', () => {
    const tree = view.hotspots.complexity;

    expect(tree.children?.map((c) => [c.label, c.children?.map((f) => f.label)])).toEqual(
      [
        ['scripts/', ['pen', '(root)']],
        ['@gate/visual-diff-ui', ['lib', 'components', '__tests__']],
        ['.sandcastle/', ['(root)']],
        ['@gate/e2e', ['(root)']],
      ],
    );
    expect(tree.children?.[0]?.children?.[1]).toEqual({
      label: '(root)',
      detail: '2 files',
      weight: 0.31,
      tone: 'heat-4',
    });
  });

  it('keeps a hotspot outside every workspace under the repository root', () => {
    const stray: Measurement = {
      ...measurement,
      health: {
        ...measurement.health,
        hotspots: [{ path: 'turbo.json', churn: 3, complexity: 0.01 }],
      },
    };

    expect(complexityTree(stray).children).toEqual([
      {
        label: '(root)',
        children: [{ label: '(root)', detail: '1 file', weight: 0.01, tone: 'heat-1' }],
      },
    ]);
  });
});

describe('overviewOf the sample: coverage by workspace and the rest', () => {
  it('sizes measured workspaces by lines and toned by their floor', () => {
    const root = view.codeCoverage;

    expect(root.detail).toBe('15.3k lines · 2 of 11 workspaces measure');
    expect(root.children?.map((c) => [c.label, c.detail])).toEqual([
      ['apps', '12k lines'],
      ['scripts', 'unmeasured'],
      ['packages', '3.3k lines'],
    ]);
    expect(root.children?.[0]?.children?.[0]).toMatchObject({
      label: '@gate/visual-diff-ui',
      detail: '95.2% · floor 94',
      tone: 'success',
    });
    expect(root.children?.[0]?.children?.[1]).toMatchObject({
      detail: 'unmeasured',
      tone: 'danger',
    });
  });

  it('carries every gap, the notes, the rerun inputs and the exports', () => {
    expect(view.gaps).toHaveLength(57);
    expect(view.notes[0]).toMatch(/^CRAP is estimated/);
    expect(view.rerun.split('\n')).toEqual([
      'workflow: pnpm census:measure',
      'commit: 0514dc9 · measured 20 Nov 2026',
      'tools: vitest 5.0.5 · fallow 3.36.0 · storybook 10.6.2',
      'output: apps/census/measurement.json · history.json',
    ]);
    expect(view.exports.jsonHref).toMatch(
      /^https:\/\/github\.com\/climaa\/acceptance-gate\/raw\/0514dc9a[0-9a-f]+\/apps\/census\/measurement\.json$/,
    );
  });
});

describe('overviewOf a thin measurement', () => {
  const ui = measurement.workspaces.find((ws) => ws.name === '@gate/ui')!;
  const underFloor: Workspace = {
    ...ui,
    dimensions: {
      ...ui.dimensions,
      code: {
        ...(ui.dimensions.code as Extract<
          Workspace['dimensions']['code'],
          { state: 'measured' }
        >),
        floor: 99.5,
      },
      visual: {
        dimension: 'visual',
        state: 'measured',
        components: { total: 0, storied: 0, tiled: 0, baselined: 0 },
      },
    },
  };
  const noFloor: Workspace = {
    ...ui,
    name: '@gate/nofloor',
    path: 'packages/nofloor',
    dimensions: {
      ...ui.dimensions,
      code: {
        dimension: 'code',
        state: 'measured',
        lines: { covered: 1, total: 2, pct: 50 },
        staticReachPct: 50,
        files: [],
      },
      visual: { dimension: 'visual', state: 'not-applicable', reason: 'No components' },
    },
  };
  const thin: Measurement = {
    ...measurement,
    tools: {},
    pyramid: { unit: 10, visual: 0, acceptance: 0 },
    health: { ...measurement.health, styling: undefined, crapSource: 'measured' },
    workspaces: [underFloor, noFloor],
    gaps: [],
  };
  const oneDay: History = {
    schema: 1,
    points: [
      {
        ...history.points.at(-1)!,
        dimensions: { code: null, visual: null, acceptance: null, health: null },
      },
    ],
  };
  const thinView = overviewOf(thin, oneDay);

  it('has no deltas, and a dash for a code value the history lacks', () => {
    expect(thinView.coverage.every((r) => r.delta === undefined && r.value === 0)).toBe(
      true,
    );
    expect(thinView.metrics[0]?.value).toBe('—');
    expect(thinView.metrics[0]?.change).toBe('—');
    expect(thinView.health.delta).toBeUndefined();
  });

  it('leaves out what was not measured', () => {
    expect(thinView.pyramid.caption).toBeUndefined();
    expect(thinView.styling).toBeNull();
    expect(thinView.notes).toHaveLength(1);
    expect(thinView.health.source).toBe('of 100');
    expect(thinView.stories.workspaces).toEqual([]);
    expect(thinView.states.caption).toBe('No Next.js route is measured.');
    expect(thinView.states.withoutLoading).toEqual([]);
  });

  it('tones a workspace under its floor, and prints one without a floor bare', () => {
    const leaves = thinView.codeCoverage.children?.[0]?.children;

    expect(leaves?.map((l) => [l.detail, l.tone])).toEqual([
      ['98.9% · floor 99.5', 'warning'],
      ['50%', 'success'],
    ]);
  });

  it('gives a panel no delta when the history is shorter than the window', () => {
    expect(thinView.health.sparks.map((s) => s.delta)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('draws no sparklines with no history', () => {
    expect(overviewOf(thin, { schema: 1, points: [] }).health.sparks).toEqual([]);
  });

  it('says the routes are not all inherited when one app has its own', () => {
    // Arrange
    const blog = measurement.workspaces.find((ws) => ws.name === '@gate/blog')!;
    const visual = blog.dimensions.visual as Extract<
      Workspace['dimensions']['visual'],
      { state: 'measured' }
    >;
    const own: Measurement = {
      ...measurement,
      workspaces: [
        {
          ...blog,
          dimensions: {
            ...blog.dimensions,
            visual: {
              ...visual,
              routes: { ...visual.routes!, error: { own: 1, inherited: 6, none: 0 } },
            },
          },
        },
      ],
      gaps: [],
    };

    // Act
    const caption = overviewOf(own, history).states.caption;

    // Assert
    expect(caption).toBe('Next.js route files across 7 routes in blog.');
  });
});

describe('the small formatters', () => {
  it('signs a number with a true minus', () => {
    expect([signed(7), signed(-3), signed(0)]).toEqual(['+7', '−3', '0']);
  });

  it('prints thousands as k', () => {
    expect([kilo(999), kilo(15290), kilo(12000)]).toEqual(['999', '15.3k', '12k']);
  });

  it('steps complexity density into four heats', () => {
    expect([heat(0.01), heat(0.05), heat(0.1), heat(0.2)]).toEqual([
      'heat-1',
      'heat-2',
      'heat-3',
      'heat-4',
    ]);
  });

  it('writes the gaps as a checklist, one section per dimension with any', () => {
    const md = gapsMarkdown(measurement);

    expect(
      md.startsWith(
        '# Census · climaa/acceptance-gate · 0514dc9 · 20 Nov 2026\n\n## Code (9)\n\n- [ ] @gate/links: measure coverage',
      ),
    ).toBe(true);
    expect(md).toContain('## Acceptance (2)');
    expect(md).not.toContain('## Health');
  });
});

import { describe, expect, it } from 'vitest';

import type { Measurement, Workspace } from '@/lib/measurement.ts';
import {
  workspaceHref,
  workspaceParams,
  workspaceSlug,
  workspaceView,
  type WorkspaceView,
} from '@/lib/workspace.ts';
import { sample } from './sample';

const BLOB =
  'https://github.com/climaa/acceptance-gate/blob/0514dc9a3f6e2b7c8d1e4f5a6b7c8d9e0f1a2b3c';

const { measurement } = sample();

function viewOf(slug: string, m: Measurement = measurement): WorkspaceView {
  const view = workspaceView(m, slug);
  if (view === null) throw new Error(`no workspace at /${slug}`);
  return view;
}

/** The sample with one workspace replaced, everything else as committed. */
function withWorkspace(name: string, change: (ws: Workspace) => Workspace): Measurement {
  return {
    ...measurement,
    workspaces: measurement.workspaces.map((ws) => (ws.name === name ? change(ws) : ws)),
  };
}

describe('workspaceSlug', () => {
  it("is the last segment of the workspace's path", () => {
    const slug = workspaceSlug({ path: 'packages/visual-diff' });

    expect(slug).toBe('visual-diff');
  });

  it('drops the leading dot of a hidden directory', () => {
    const slug = workspaceSlug({ path: '.sandcastle' });

    expect(slug).toBe('sandcastle');
  });
});

describe('workspaceParams', () => {
  it("is one param per workspace and pseudo-workspace in the measurement, in the file's order", () => {
    const params = workspaceParams(measurement);

    expect(params).toEqual(
      measurement.workspaces.map((ws) => ({ workspace: workspaceSlug(ws) })),
    );
    expect(params.map((p) => p.workspace)).toEqual([
      'ui',
      'links',
      'logger',
      'visual-diff',
      'tsconfig',
      'visual-diff-ui',
      'blog',
      'e2e',
      'manual',
      'storybook',
      'scripts',
      'sandcastle',
    ]);
  });

  it('refuses a measurement where two workspaces would share an address', () => {
    const twin = withWorkspace('@gate/links', (ws) => ({ ...ws, path: 'apps/ui' }));

    expect(() => workspaceParams(twin)).toThrow('/ui');
  });
});

describe('workspaceHref', () => {
  it('is the page at the slug', () => {
    expect(workspaceHref({ path: 'apps/blog' })).toBe('/blog');
  });
});

describe('workspaceView', () => {
  it('is null for a slug no workspace has', () => {
    expect(workspaceView(measurement, 'nowhere')).toBeNull();
  });

  it('names the workspace, its path, its category and the measuring tools', () => {
    const view = viewOf('ui');

    expect(view).toMatchObject({
      name: '@gate/ui',
      path: 'packages/ui',
      category: 'packages',
      tools: 'vitest 5.0.5 · fallow 3.36.0 · storybook 10.6.2',
    });
  });
});

describe('the stat tiles', () => {
  it('draws one tile per dimension, in order, for a measured package', () => {
    const tiles = viewOf('ui').tiles;

    expect(tiles).toEqual([
      {
        label: 'Code',
        value: '98.9%',
        detail: '3,254 of 3,290 lines · floor 90',
        state: 'measured',
        meter: { label: 'Code: lines covered', value: 98.9, floor: 90, hue: 'chart' },
      },
      {
        label: 'Visual',
        value: '30 / 31',
        detail: 'components with a story, a tile and a baseline',
        state: 'gaps',
        meter: { label: 'Visual: components complete', value: 96.8, hue: 'chart-2' },
      },
      {
        label: 'Acceptance',
        value: '—',
        detail: 'A package is not a deployed app',
        state: 'not-applicable',
      },
      {
        label: 'Health',
        value: '0 over 20',
        detail: 'every function under the ceiling',
        state: 'measured',
        meter: {
          label: 'Health: functions under the ceiling',
          value: 100,
          hue: 'chart-4',
        },
      },
    ]);
  });

  it('says the Code card is not measured, and why, with a dashed track', () => {
    const code = viewOf('blog').tiles[0];

    expect(code).toEqual({
      label: 'Code',
      value: 'none',
      detail: 'No coverage block in vitest.config',
      state: 'unmeasured',
      meter: { label: 'Code: lines covered', value: null, hue: 'chart' },
    });
  });

  it("counts an app's screens, not its components", () => {
    const visual = viewOf('blog').tiles[1];

    expect(visual).toMatchObject({
      value: '0 / 8',
      detail: 'screens with a tile and a baseline',
      state: 'gaps',
      meter: { value: 0 },
    });
  });

  it('reads a workspace with no component as 0 / 0, its bar empty', () => {
    const bare = withWorkspace('@gate/ui', (ws) => ({
      ...ws,
      dimensions: {
        ...ws.dimensions,
        visual: {
          dimension: 'visual',
          state: 'measured',
          components: { total: 0, storied: 0, tiled: 0, baselined: 0 },
        },
      },
    }));

    const visual = viewOf('ui', bare).tiles[1];

    expect(visual).toMatchObject({ value: '0 / 0', meter: { value: 0 } });
  });

  it('counts scenarios and features for a visited app', () => {
    const acceptance = viewOf('blog').tiles[2];

    expect(acceptance).toEqual({
      label: 'Acceptance',
      value: '27',
      detail: 'scenarios in 6 features',
      state: 'measured',
      meter: { label: 'Acceptance: visited by a scenario', value: 100, hue: 'chart-3' },
    });
  });

  it('marks an app no scenario visits as a gap, with an empty bar', () => {
    const acceptance = viewOf('manual').tiles[2];

    expect(acceptance).toMatchObject({
      value: '0',
      detail: 'scenarios in 0 features',
      state: 'gaps',
      meter: { value: 0 },
    });
  });

  it('counts the functions over the ceiling, one or many', () => {
    const one = withWorkspace('scripts/', (ws) =>
      ws.dimensions.health.state === 'measured'
        ? {
            ...ws,
            dimensions: {
              ...ws.dimensions,
              health: { ...ws.dimensions.health, overCeiling: 1 },
            },
          }
        : ws,
    );

    expect(viewOf('scripts').tiles[3]).toMatchObject({
      value: '3 over 20',
      detail: '3 functions over the ceiling',
    });
    expect(viewOf('scripts', one).tiles[3]?.detail).toBe('1 function over the ceiling');
  });

  it('draws no Health bar over the ceiling, where no share was measured', () => {
    const health = viewOf('scripts').tiles[3];

    expect(health).toEqual({
      label: 'Health',
      value: '3 over 20',
      detail: '3 functions over the ceiling',
      state: 'measured',
    });
  });

  it('leaves the floor out of a Code card whose workspace sets none', () => {
    const floorless = withWorkspace('@gate/ui', (ws) => {
      const code = ws.dimensions.code;
      if (code.state !== 'measured') return ws;
      const { floor: _floor, ...rest } = code;
      return { ...ws, dimensions: { ...ws.dimensions, code: rest } };
    });

    const code = viewOf('ui', floorless).tiles[0];

    expect(code?.detail).toBe('3,254 of 3,290 lines');
    expect(code?.meter).toEqual({
      label: 'Code: lines covered',
      value: 98.9,
      hue: 'chart',
    });
  });
});

describe('the code section', () => {
  it('sizes one block per file under its tier, coloured by coverage', () => {
    const code = viewOf('ui').code;
    if (code.state !== 'measured') throw new Error('measured');

    expect(code.files).toBe(33);
    expect(code.root).toMatchObject({
      label: '@gate/ui',
      detail: '3.3k lines · 98.9% lines covered',
    });
    expect(code.root.children?.map((c) => [c.label, c.detail])).toEqual([
      ['organisms', '153 lines'],
      ['atoms', '152 lines'],
      ['molecules', '77 lines'],
      ['templates', '26 lines'],
    ]);
    expect(code.root.children?.[0]?.children?.[0]).toEqual({
      label: 'PanZoom',
      detail: '96.9%',
      weight: 64,
      tone: 'success',
    });
  });

  it('tones a file under the floor as a warning and an untested one as danger', () => {
    const code = viewOf('ui').code;
    if (code.state !== 'measured') throw new Error('measured');
    const templates = code.root.children?.find((c) => c.label === 'templates');

    expect(templates?.children?.map((c) => [c.label, c.tone])).toEqual([
      ['below-floor', 'warning'],
      ['PostTemplate', 'success'],
      ['no-test', 'danger'],
    ]);
  });

  it('names the legend after the floor', () => {
    const code = viewOf('ui').code;
    if (code.state !== 'measured') throw new Error('measured');

    expect(code.legend).toEqual([
      { label: 'at or over the floor', tone: 'success' },
      { label: 'under the floor', tone: 'warning' },
      { label: '0%', tone: 'danger' },
    ]);
  });

  it('puts a file with no group under (root)', () => {
    const ungrouped = withWorkspace('@gate/visual-diff-ui', (ws) => {
      const code = ws.dimensions.code;
      if (code.state !== 'measured') return ws;
      const files = code.files.map(({ group: _group, ...file }) => file);
      return { ...ws, dimensions: { ...ws.dimensions, code: { ...code, files } } };
    });

    const code = viewOf('visual-diff-ui', ungrouped).code;

    expect(code.state === 'measured' && code.root.children?.map((c) => c.label)).toEqual([
      '(root)',
    ]);
  });

  it('says why nothing is drawn for an unmeasured workspace', () => {
    expect(viewOf('blog').code).toEqual({
      state: 'unmeasured',
      title: 'Not measured',
      reason:
        'This workspace configures no coverage, so no file can be drawn. Its first gap is the one that fixes that.',
    });
  });

  it('says so for a workspace with no code', () => {
    expect(viewOf('tsconfig').code).toEqual({
      state: 'not-applicable',
      title: 'Nothing to measure',
      reason: 'No code',
    });
  });
});

describe('the health section', () => {
  it("gives the workspace's own score and what fallow found under it", () => {
    const health = viewOf('ui').health;

    expect(health).toMatchObject({
      title: 'Health · @gate/ui',
      score: 88.2,
      grade: 'A',
      source: 'of 100 · fallow 3.36.0',
      caption:
        'fallow on this workspace alone: no functions over the ceiling, no dead files, no dead exports, no refactor targets.',
    });
  });

  it('is null for a workspace fallow does not score', () => {
    expect(viewOf('tsconfig').health).toBeNull();
  });

  it('draws the files three ways, CRAP first, each with its legend', () => {
    const views = viewOf('ui').health?.views;

    expect(views?.map((v) => [v.value, v.label])).toEqual([
      ['crap', 'CRAP'],
      ['coverage', 'Coverage'],
      ['maintainability', 'Maintainability'],
    ]);
    expect(views?.[0]?.legend).toEqual([
      { label: 'under 15', tone: 'success' },
      { label: '15–30', tone: 'warning' },
      { label: '30 and over', tone: 'danger' },
    ]);
    expect(views?.[0]?.root.detail).toBe('3.3k lines · CRAP by file');
    expect(views?.[0]?.root.children?.[0]?.children?.[0]).toMatchObject({
      label: 'PanZoom',
      detail: 'CRAP 49.5',
      tone: 'danger',
    });
  });

  it('tones maintainability under 70 as low', () => {
    const maintainability = viewOf('ui').health?.views.find(
      (v) => v.value === 'maintainability',
    );
    const leaves = maintainability?.root.children?.flatMap((c) => c.children ?? []);

    expect(leaves?.find((l) => l.label === 'PanZoom')).toMatchObject({
      detail: 'maintainability 71.3',
      tone: 'success',
    });
    expect(leaves?.filter((l) => l.tone === 'warning').map((l) => l.label)).toEqual([]);
  });

  it('draws a file fallow did not score as neutral, without a figure', () => {
    const unscored = withWorkspace('@gate/ui', (ws) => {
      const code = ws.dimensions.code;
      if (code.state !== 'measured') return ws;
      const files = code.files.map(({ crap: _c, maintainability: _m, ...file }) => file);
      return { ...ws, dimensions: { ...ws.dimensions, code: { ...code, files } } };
    });

    const crap = viewOf('ui', unscored).health?.views[0];

    expect(crap?.root.children?.[0]?.children?.[0]).toEqual({
      label: 'PanZoom',
      weight: 64,
      tone: 'neutral',
    });
  });

  it('has no file views where coverage is unmeasured', () => {
    expect(viewOf('blog').health?.views).toEqual([]);
  });

  it('states the CRAP source in the note', () => {
    expect(viewOf('ui').health?.note).toBe(
      'CRAP is estimated until the measure step feeds coverage-final.json to fallow. Maintainability: under 70 is low.',
    );
  });
});

describe('what costs the workspace points', () => {
  const withPenalties = (penalties: { name: string; points: number }[]) =>
    withWorkspace('@gate/ui', (ws) =>
      ws.dimensions.health.state === 'measured'
        ? {
            ...ws,
            dimensions: {
              ...ws.dimensions,
              health: { ...ws.dimensions.health, penalties },
            },
          }
        : ws,
    );

  it("labels the workspace's own penalties as the card reads them", () => {
    const measured = withPenalties([
      { name: 'unit size', points: 10 },
      { name: 'coupling', points: 0.6 },
      { name: 'dead exports', points: 0.1 },
    ]);

    const penalties = viewOf('ui', measured).health?.penalties;

    expect(penalties).toEqual([
      { name: 'Function size', points: 10 },
      { name: 'Coupling', points: 0.6 },
      { name: 'Dead exports', points: 0.1 },
    ]);
  });

  it('is empty when nothing cost points', () => {
    const penalties = viewOf('ui', withPenalties([])).health?.penalties;

    expect(penalties).toEqual([]);
  });

  it("is empty, never the repository's, when the measurement recorded none", () => {
    const penalties = viewOf('ui').health?.penalties;

    expect(measurement.health.penalties.length).toBeGreaterThan(0);
    expect(penalties).toEqual([]);
  });
});

describe('the health section, measured otherwise', () => {
  it('says CRAP is measured once the measure step feeds coverage to fallow', () => {
    const measured = {
      ...measurement,
      health: { ...measurement.health, crapSource: 'measured' as const },
    };

    const note = viewOf('ui', measured).health?.note;

    expect(note).toBe(
      'CRAP is measured from coverage-final.json. Maintainability: under 70 is low.',
    );
  });

  it('leaves the version out of the source when fallow is not among the tools', () => {
    const { fallow: _fallow, ...tools } = measurement.tools;

    const source = viewOf('ui', { ...measurement, tools }).health?.source;

    expect(source).toBe('of 100');
  });
});

describe('the refactor targets', () => {
  it("keeps the repository's targets under the workspace, costliest first, linked at the commit", () => {
    const targets = viewOf('scripts').health?.targets;

    expect(targets).toEqual([
      {
        path: 'scripts/pen/place-tiles.js',
        href: `${BLOB}/scripts/pen/place-tiles.js`,
        action: '',
        effort: 'medium',
        priority: 35,
      },
      {
        path: 'scripts/gate/manifest.mjs',
        href: `${BLOB}/scripts/gate/manifest.mjs`,
        action: '',
        effort: 'medium',
        priority: 24.1,
      },
      {
        path: 'scripts/pen/board-scale-integrity.mjs',
        href: `${BLOB}/scripts/pen/board-scale-integrity.mjs`,
        action: '',
        effort: 'medium',
        priority: 22.8,
      },
      {
        path: 'scripts/policy.test.mjs',
        href: `${BLOB}/scripts/policy.test.mjs`,
        action: '',
        effort: 'medium',
        priority: 21.3,
      },
    ]);
  });

  it('is empty where none falls under the workspace', () => {
    expect(viewOf('ui').health?.targets).toEqual([]);
  });

  it("does not take a sibling whose path only starts with the workspace's", () => {
    expect(viewOf('visual-diff').health?.targets).toEqual([]);
  });
});

describe('the files table', () => {
  it('lists the largest files first, each linked at the commit, with the shared src/ dropped', () => {
    const files = viewOf('ui').files;

    expect(files?.total).toBe(33);
    expect(files?.rows.slice(0, 2)).toEqual([
      {
        path: 'organisms/PanZoom/PanZoom.tsx',
        href: `${BLOB}/packages/ui/src/organisms/PanZoom/PanZoom.tsx`,
        lines: 64,
        covered: 62,
        pct: '96.9%',
        tone: 'success',
      },
      {
        path: 'organisms/Table/Table.tsx',
        href: `${BLOB}/packages/ui/src/organisms/Table/Table.tsx`,
        lines: 41,
        covered: 41,
        pct: '100%',
        tone: 'success',
      },
    ]);
  });

  it('shows every file under 100%, and folds the rest into one line', () => {
    const files = viewOf('ui').files;

    expect(files?.rows.map((r) => r.lines)).toEqual([
      64, 41, 33, 24, 22, 19, 18, 16, 14, 12, 11, 10, 8,
    ]);
    expect(files?.rows.at(-1)).toMatchObject({
      path: 'templates/sample/no-test.ts',
      pct: '0%',
      tone: 'danger',
    });
    expect(files?.more).toBe('20 more files, each at 100%');
  });

  it('keeps paths whole when the files share no folder', () => {
    const rows = viewOf('visual-diff-ui').files?.rows;

    expect(rows?.map((r) => r.path)).toEqual([
      'lib/jobs.ts',
      'lib/comparison.ts',
      'components/RunPanel.tsx',
    ]);
  });

  it('folds nothing when every file fits', () => {
    expect(viewOf('visual-diff-ui').files?.more).toBeNull();
  });

  it('is null where coverage is unmeasured', () => {
    expect(viewOf('blog').files).toBeNull();
  });

  it('is empty, with nothing folded, for a measured workspace with no file', () => {
    const empty = withWorkspace('@gate/ui', (ws) =>
      ws.dimensions.code.state === 'measured'
        ? {
            ...ws,
            dimensions: { ...ws.dimensions, code: { ...ws.dimensions.code, files: [] } },
          }
        : ws,
    );

    expect(viewOf('ui', empty).files).toEqual({ total: 0, rows: [], more: null });
  });
});

describe('the gaps', () => {
  it("groups the workspace's gaps by dimension, in order", () => {
    const gaps = viewOf('blog').gaps;

    expect(gaps.count).toBe(19);
    expect(gaps.groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Code', 1],
      ['Visual', 18],
    ]);
    expect(gaps.groups[0]?.rows[0]).toEqual({
      id: 'unmeasured-workspace:apps/blog',
      anchor: 'gap-unmeasured-workspace:apps/blog',
      title: '@gate/blog: measure coverage',
      kind: 'unmeasured-workspace',
    });
  });

  it('is empty for a workspace with none', () => {
    expect(viewOf('tsconfig').gaps).toEqual({ count: 0, groups: [] });
  });
});

describe('the inventory', () => {
  it("lists a package's components with what each has and where to open it", () => {
    const inventory = viewOf('ui').inventory;

    expect(inventory?.heading).toBe('Components');
    expect(inventory?.count).toBe(31);
    expect(inventory?.rows[0]).toEqual({
      key: 'Badge',
      name: 'Badge',
      tier: 'atoms',
      story: true,
      tiled: true,
      baselined: true,
      links: [
        {
          label: 'Storybook',
          href: 'https://storybook.carloslima.dev/?path=/story/atoms-badge--default',
        },
        { label: 'board', href: `${BLOB}/designs/exports/01-atoms.png` },
        {
          label: 'set',
          href: 'https://visual-diff-ui.carloslima.dev/set/baselines#vd-tier-atoms',
        },
      ],
    });
  });

  it('shows the first ten and every incomplete one, and folds the rest', () => {
    const inventory = viewOf('ui').inventory;

    expect(inventory?.rows).toHaveLength(11);
    expect(inventory?.rows.at(-1)).toEqual({
      key: 'Stack',
      name: 'Stack',
      tier: 'atoms',
      story: false,
      tiled: false,
      baselined: false,
      links: [],
    });
    expect(inventory?.more).toBe('20 more components, each with all three');
  });

  it("lists an app's screens by page and state, without a board where there is no tile", () => {
    const inventory = viewOf('blog').inventory;

    expect(inventory?.heading).toBe('Screens');
    expect(inventory?.count).toBe(8);
    expect(inventory?.more).toBeNull();
    expect(inventory?.rows[0]).toEqual({
      key: 'screens-blog-about--default',
      name: 'about · default',
      tier: 'screens',
      story: true,
      tiled: false,
      baselined: true,
      links: [
        {
          label: 'Storybook',
          href: 'https://storybook.carloslima.dev/?path=/story/screens-blog-about--default',
        },
        {
          label: 'set',
          href: 'https://visual-diff-ui.carloslima.dev/set/baselines#vd-tier-screens',
        },
      ],
    });
  });

  it('is null where the measurement lists nothing', () => {
    expect(viewOf('manual').inventory).toBeNull();
    expect(viewOf('tsconfig').inventory).toBeNull();
  });
});

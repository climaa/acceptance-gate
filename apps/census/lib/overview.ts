/**
 * The measured home, section by section, as plain data. Every figure is read
 * off the committed measurement and history; the components only draw it.
 * Built once at build: the reader's filter is applied later, in the browser,
 * by `filter.ts`, over the rows this returns.
 */
import type { IcicleNode, IcicleTone } from '@gate/ui';

import { utcDate } from './dates.ts';
import { gapRows, type GapRow } from './filter.ts';
import {
  APP_OF,
  appShare,
  componentsOf,
  routeStates,
  scopeShare,
  staticReach,
  storyShare,
  unstoriedShare,
  type Share,
} from './figures.ts';
import {
  DIMENSIONS,
  type Dimension,
  type History,
  type Measurement,
} from './measurement.ts';
import { summaryOf, type Summary } from './summary.ts';
import { type TargetView, targetViews } from './targets.ts';
import {
  DIMENSION_LABEL,
  WINDOW_DAYS,
  deltaOf,
  trendSeries,
  type TrendSeries,
} from './trend.ts';

export const WINDOW = `${WINDOW_DAYS} d`;
export const MEASURE_COMMAND = 'pnpm census:measure';

export interface CoverageRowView {
  dimension: Dimension;
  name: string;
  detail: string;
  value: number;
  delta?: number;
}

export interface MetricRow {
  key: string;
  dimension: string;
  metric: string;
  value: string;
  unit: string;
  change: string;
  period: string;
}

export interface SparkView {
  label: string;
  value: string;
  /** A second figure beside the value, in small type. */
  aside?: string;
  /** Absent when the history does not reach back the whole window. */
  delta: number | undefined;
  better: 'up' | 'down';
  series: number[];
}

export interface NamedCount {
  name: string;
  detail: string;
  value: string;
  /** 0–100, for a count that is part of a measured total. */
  share?: number;
}

export interface Overview {
  summary: Summary;
  coverage: CoverageRowView[];
  metrics: MetricRow[];
  pyramid: {
    bands: {
      dimension: 'code' | 'visual' | 'acceptance';
      label: string;
      count: number;
    }[];
    caption?: string;
  };
  gapPills: {
    gaps: { dimension: Dimension; label: string; count: number }[];
    caption: string;
  };
  stories: {
    unstoried: number;
    total: number;
    workspaces: { name: string; total: number; missing: string[] }[];
  };
  states: {
    caption: string;
    pies: { name: string; own: number; inherited: number; none: number }[];
    heading: string;
    withoutLoading: { app: string; routes: string[] }[];
  };
  trend: TrendSeries[];
  health: {
    score: number;
    grade: string;
    delta?: number;
    source: string;
    penalties: { name: string; points: number }[];
    unitSize: readonly [number, number, number, number];
    interfacing: readonly [number, number, number, number];
    sparks: SparkView[];
  };
  dead: { rows: NamedCount[]; boundariesConfigured: boolean };
  styling: {
    score: number;
    grade: string;
    source: string;
    /** Empty when the measurement recorded none. */
    penalties: { name: string; points: number }[];
    findings: NamedCount[];
  } | null;
  hotspots: {
    dots: {
      path: string;
      churn: number;
      complexity: number;
      hot: boolean;
      label?: 'start' | 'end';
    }[];
    complexity: IcicleNode;
    targets: TargetView[];
    targetCount: number;
  };
  codeCoverage: IcicleNode;
  gaps: GapRow[];
  notes: string[];
  rerun: string;
  exports: { jsonHref: string; markdown: string };
}

const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);
const shareText = ({ part, whole }: Share) => `${part} / ${whole}`;

/** `+7`, `−3` (a minus sign, not a hyphen), `0`. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

/** `15290` → `15.3k`; below a thousand, the number. */
export function kilo(n: number): string {
  return n < 1000 ? String(n) : `${Math.round(n / 100) / 10}k`;
}

const latest = (history: History) => history.points.at(-1);
const dimensionDelta = (history: History, d: Dimension) =>
  deltaOf(history.points, (p) => p.dimensions[d]);

function coverageRows(m: Measurement, history: History): CoverageRowView[] {
  const reach = staticReach(m);
  const stories = storyShare(m);
  const apps = appShare(m);
  const scopes = scopeShare(m);
  const detail: Record<Dimension, string> = {
    code:
      reach === null
        ? 'lines covered'
        : `lines covered · ${reach}% of files reached by a test`,
    visual: `${stories.part} of ${stories.whole} with story · tile · baseline`,
    acceptance: `${apps.part} of ${apps.whole} apps a scenario visits`,
    health: `${scopes.part} of ${scopes.whole} scopes under the complexity ceiling`,
  };
  return DIMENSIONS.map((dimension) => {
    const delta = dimensionDelta(history, dimension);
    return {
      dimension,
      name: DIMENSION_LABEL[dimension],
      detail: detail[dimension],
      value: latest(history)?.dimensions[dimension] ?? 0,
      ...(delta === undefined ? {} : { delta }),
    };
  });
}

const change = (delta: number | undefined, unit = '') =>
  delta === undefined ? '—' : `${signed(delta)}${unit}`;

function metricRows(m: Measurement, history: History): MetricRow[] {
  const routes = routeStates(m);
  const code = latest(history)?.dimensions.code;
  const row = (
    key: string,
    d: string,
    metric: string,
    value: string,
    unit: string,
    delta?: number,
    pts = true,
  ): MetricRow => ({
    key,
    dimension: d,
    metric,
    value,
    unit,
    change: change(delta, pts ? ' pts' : ''),
    period: WINDOW,
  });
  const now = (
    key: string,
    d: string,
    metric: string,
    value: string,
    unit: string,
  ): MetricRow => ({
    key,
    dimension: d,
    metric,
    value,
    unit,
    change: '—',
    period: 'now',
  });
  return [
    row(
      'code',
      'Code',
      'lines covered',
      code === undefined || code === null ? '—' : String(code),
      '%',
      dimensionDelta(history, 'code'),
    ),
    row(
      'visual',
      'Visual',
      'story · tile · baseline',
      shareText(storyShare(m)),
      'components',
      dimensionDelta(history, 'visual'),
    ),
    row(
      'acceptance',
      'Acceptance',
      'apps visited',
      shareText(appShare(m)),
      'apps',
      dimensionDelta(history, 'acceptance'),
    ),
    row(
      'health',
      'Health',
      'scopes under the ceiling',
      shareText(scopeShare(m)),
      'scopes',
      dimensionDelta(history, 'health'),
    ),
    row(
      'score',
      'Health',
      'fallow score',
      String(m.health.score),
      'of 100',
      deltaOf(history.points, (p) => p.fallow.score),
      false,
    ),
    now(
      'unstoried',
      'Visual',
      'components without a story',
      shareText(unstoriedShare(m)),
      'components',
    ),
    now(
      'loading',
      'Visual',
      'routes without loading',
      `${routes.loading.none} / ${routes.total}`,
      'routes',
    ),
  ];
}

function pyramidOf(m: Measurement): Overview['pyramid'] {
  const { unit, visual, acceptance } = m.pyramid;
  return {
    bands: [
      // Base first: TestPyramid stacks its bands from the bottom up.
      { dimension: 'code', label: 'Code · vitest cases', count: unit },
      { dimension: 'visual', label: 'Visual · screenshots', count: visual },
      { dimension: 'acceptance', label: 'Acceptance · scenarios', count: acceptance },
    ],
    ...(acceptance > 0
      ? {
          caption: `Log scale · ${Math.round(unit / acceptance)}× more vitest cases than scenarios`,
        }
      : {}),
  };
}

const PILL_LABEL: Record<Dimension, string> = {
  code: 'code',
  visual: 'visual',
  acceptance: 'accept.',
  health: 'health',
};

function gapPillsOf(m: Measurement): Overview['gapPills'] {
  return {
    gaps: DIMENSIONS.map((dimension) => ({
      dimension,
      label: PILL_LABEL[dimension],
      count: m.gaps.filter((g) => g.dimension === dimension).length,
    })),
    caption: `${m.gaps.length} gaps, each one an issue to file.`,
  };
}

function storiesOf(m: Measurement): Overview['stories'] {
  const share = unstoriedShare(m);
  const missing = (name: string) =>
    m.gaps
      .filter((g) => g.kind === 'story-missing' && g.workspace === name)
      .map((g) => g.subject);
  return {
    unstoried: share.part,
    total: share.whole,
    workspaces: componentsOf(m)
      .filter((c) => c.unstoried > 0)
      .map((c) => ({ name: c.ws.name, total: c.total, missing: missing(c.ws.name) })),
  };
}

const listed = (names: readonly string[]) =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function statesOf(m: Measurement): Overview['states'] {
  const s = routeStates(m);
  const appOf = new Map(m.workspaces.map((ws) => [ws.name, APP_OF[ws.path] ?? ws.name]));
  const byApp = new Map<string, string[]>();
  for (const gap of m.gaps) {
    if (gap.kind !== 'route-state-missing' || !gap.subject.endsWith(':loading')) continue;
    const app = appOf.get(gap.workspace) ?? gap.workspace;
    byApp.set(app, [...(byApp.get(app) ?? []), gap.subject.slice(0, -':loading'.length)]);
  }
  const inherited = s.error.own + s.error.none + s.notFound.own + s.notFound.none === 0;
  const caption =
    s.total === 0
      ? 'No Next.js route is measured.'
      : `Next.js route files across ${s.total} routes in ${listed(s.apps)}.${inherited ? " error and not-found are inherited from each app's root." : ''}`;
  return {
    caption,
    pies: [
      { name: 'loading', ...s.loading },
      { name: 'error', ...s.error },
      { name: 'not-found', ...s.notFound },
    ],
    heading: `${s.loading.none} routes without loading`,
    withoutLoading: [...byApp].map(([app, routes]) => ({ app, routes })),
  };
}

function sparksOf(m: Measurement, history: History): SparkView[] {
  const points = history.points;
  const last = latest(history)!;
  const spark = (
    label: string,
    pick: (p: (typeof points)[number]) => number | undefined,
    value: string,
    better: 'up' | 'down',
  ): SparkView => ({
    label,
    value,
    delta: deltaOf(points, (p) => pick(p) ?? null),
    better,
    series: points.flatMap((p) => pick(p) ?? []),
  });
  return [
    spark('CRAP ≥ 30', (p) => p.fallow.crapOver, String(last.fallow.crapOver), 'down'),
    spark(
      'Over ceiling',
      (p) => p.fallow.overCeiling,
      String(last.fallow.overCeiling),
      'down',
    ),
    {
      ...spark('Duplication', (p) => p.fallow.dupPct, `${last.fallow.dupPct}%`, 'down'),
      aside: `${m.health.duplication.semanticPct}% semantic`,
    },
    spark('Dead files', (p) => p.fallow.deadFiles, String(m.health.dead.files), 'down'),
  ];
}

function healthOf(m: Measurement, history: History): Overview['health'] {
  const delta = deltaOf(history.points, (p) => p.fallow.score);
  const fallow = m.tools.fallow === undefined ? '' : ` · fallow ${m.tools.fallow}`;
  return {
    score: m.health.score,
    grade: m.health.grade,
    ...(delta === undefined ? {} : { delta }),
    source: `of 100${fallow}`,
    penalties: m.health.penalties,
    unitSize: m.health.profiles.unitSize as unknown as Overview['health']['unitSize'],
    interfacing: m.health.profiles
      .interfacing as unknown as Overview['health']['interfacing'],
    sparks: history.points.length === 0 ? [] : sparksOf(m, history),
  };
}

/** A count as its share of `total`, or the plain count when no total was measured. */
function shareRow(
  name: string,
  detail: string,
  count: number,
  total: number | undefined,
): NamedCount {
  if (!total) return { name, detail, value: String(count) };
  const share = Math.round((count / total) * 1000) / 10;
  return {
    name,
    detail: `${count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`,
    value: `${share}%`,
    share,
  };
}

function deadRows(m: Measurement): NamedCount[] {
  const { dead } = m.health;
  return [
    shareRow('Unused files', 'files nothing imports', dead.files, dead.totalFiles),
    shareRow(
      'Unused exports',
      'exports nothing imports',
      dead.exports,
      dead.totalExports,
    ),
    {
      name: 'Unused types',
      detail: 'types nothing references',
      value: String(dead.types),
    },
    {
      name: 'Unlisted dependencies',
      detail: 'imported, missing from package.json',
      value: String(dead.unlistedDeps),
    },
    {
      name: 'Circular dependencies',
      detail: 'import cycles between modules',
      value: String(dead.cycles),
    },
  ];
}

/** fallow's penalty name as the card reads it: `dead surface` → `Dead surface`. */
function penaltyLabel(name: string): string {
  if (name === 'structural') return 'Structure';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function stylingOf(m: Measurement): Overview['styling'] {
  const styling = m.health.styling;
  if (styling === undefined) return null;
  const fallow = m.tools.fallow === undefined ? '' : ` · fallow ${m.tools.fallow}`;
  return {
    score: styling.score,
    grade: styling.grade,
    source: `of 100${fallow}`,
    penalties: (styling.penalties ?? []).map((p) => ({
      name: penaltyLabel(p.name),
      points: p.points,
    })),
    findings: [
      {
        name: 'Token drift',
        detail: 'raw value where a design token exists',
        value: String(styling.tokenDrift),
      },
      {
        name: 'Duplicate blocks',
        detail: 'same declarations twice',
        value: String(styling.duplicateBlocks),
      },
      {
        name: 'Complex selectors',
        detail: "over fallow's selector complexity",
        value: String(styling.complexSelectors),
      },
      {
        name: '!important',
        detail: 'declarations that force a win',
        value: String(styling.important),
      },
    ],
  };
}

/** The workspace a repository path belongs to: the longest workspace path it sits under. */
function ownerOf(m: Measurement, path: string) {
  const owners = m.workspaces.filter((ws) => path.startsWith(`${ws.path}/`));
  return [...owners].sort((a, b) => b.path.length - a.path.length)[0];
}

/**
 * The hotspots folded into workspace → folder, as the board draws complexity by
 * folder: a file at a workspace's top level counts under `(root)`, and a folder's
 * tone is the heat of its densest file.
 */
export function complexityTree(m: Measurement): IcicleNode {
  const folders = new Map<string, Map<string, number[]>>();
  for (const h of m.health.hotspots) {
    const ws = ownerOf(m, h.path);
    const rest = ws === undefined ? h.path : h.path.slice(ws.path.length + 1);
    const parts = rest.split('/');
    const folder = parts.length > 1 ? String(parts[0]) : '(root)';
    const owner = ws?.name ?? '(root)';
    const byFolder = folders.get(owner) ?? new Map<string, number[]>();
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), h.complexity]);
    folders.set(owner, byFolder);
  }
  return {
    label: 'repository',
    detail: `${m.health.hotspots.length} hotspots by complexity density`,
    children: [...folders].map(([owner, byFolder]) => ({
      label: owner,
      children: [...byFolder].map(([folder, densities]) => ({
        label: folder,
        detail: `${densities.length} ${densities.length === 1 ? 'file' : 'files'}`,
        weight: sum(densities),
        tone: heat(Math.max(...densities)),
      })),
    })),
  };
}

/** Complexity density as the four heat steps the legend names. */
export function heat(density: number): IcicleTone {
  if (density < 0.05) return 'heat-1';
  if (density < 0.1) return 'heat-2';
  if (density < 0.15) return 'heat-3';
  return 'heat-4';
}

const TARGETS_SHOWN = 5;

type HotspotValue = Measurement['health']['hotspots'][number];

/** A labelled dot's label reads left of it when another labelled dot sits on its row to the right. */
function labelSide(h: HotspotValue, labelled: readonly HotspotValue[]): 'start' | 'end' {
  const crowded = labelled.some(
    (o) => o !== h && o.complexity === h.complexity && o.churn > h.churn,
  );
  return crowded ? 'start' : 'end';
}

function hotspotsOf(m: Measurement): Overview['hotspots'] {
  const { hotspots, refactorTargets } = m.health;
  const targeted = new Set(refactorTargets.map((t) => t.path));
  const base = (path: string) => String(path.split('/').at(-1));
  return {
    dots: hotspots.map((h) => ({
      path: base(h.path),
      churn: h.churn,
      complexity: h.complexity,
      hot: targeted.has(h.path),
      ...(targeted.has(h.path)
        ? {
            label: labelSide(
              h,
              hotspots.filter((o) => targeted.has(o.path)),
            ),
          }
        : {}),
    })),
    complexity: complexityTree(m),
    targets: targetViews(m, refactorTargets).slice(0, TARGETS_SHOWN),
    targetCount: refactorTargets.length,
  };
}

/** An unmeasured workspace has no lines to size it by: each takes this share of the measured lines. */
const UNMEASURED_SLIVER = 0.02;

function coverageLeaf(
  ws: Measurement['workspaces'][number],
  sliver: number,
): IcicleNode | [] {
  const code = ws.dimensions.code;
  if (code.state === 'not-applicable') return [];
  if (code.state === 'unmeasured') {
    return { label: ws.name, detail: 'unmeasured', weight: sliver, tone: 'danger' };
  }
  const under = code.floor !== undefined && code.lines.pct < code.floor;
  return {
    label: ws.name,
    detail:
      code.floor === undefined
        ? `${code.lines.pct}%`
        : `${code.lines.pct}% · floor ${code.floor}`,
    weight: code.lines.total,
    tone: under ? 'warning' : 'success',
  };
}

function codeCoverageOf(m: Measurement): IcicleNode {
  const measured = m.workspaces.flatMap((ws) =>
    ws.dimensions.code.state === 'measured' ? [ws.dimensions.code] : [],
  );
  const lines = sum(measured.map((c) => c.lines.total));
  const withCode = m.workspaces.filter(
    (ws) => ws.dimensions.code.state !== 'not-applicable',
  );
  const sliver = Math.max(1, lines * UNMEASURED_SLIVER);
  const categories = ['apps', 'scripts', 'packages'] as const;
  return {
    label: 'repository',
    detail: `${kilo(lines)} lines · ${measured.length} of ${withCode.length} workspaces measure`,
    children: categories.flatMap((category) => {
      const children = withCode
        .filter((ws) => ws.category === category)
        .flatMap((ws) => coverageLeaf(ws, sliver));
      if (children.length === 0) return [];
      const own = sum(
        children.filter((c) => c.tone !== 'danger').map((c) => c.weight ?? 0),
      );
      return [
        {
          label: category,
          detail: own === 0 ? 'unmeasured' : `${kilo(own)} lines`,
          children,
        },
      ];
    }),
  };
}

function notesOf(m: Measurement): string[] {
  return [
    ...(m.health.crapSource === 'estimated'
      ? ['CRAP is estimated until the measure step passes coverage-final.json to fallow.']
      : []),
    'Stories are counted by import: a component counts as storied when a story imports it.',
  ];
}

const toolsLine = (m: Measurement) =>
  Object.entries(m.tools)
    .filter(([tool]) => tool !== 'node')
    .map(([tool, version]) => `${tool} ${version}`)
    .join(' · ');

function rerunOf(m: Measurement): string {
  return [
    `workflow: ${MEASURE_COMMAND}`,
    `commit: ${m.commit.slice(0, 7)} · measured ${utcDate(m.measuredAt)}`,
    `tools: ${toolsLine(m)}`,
    'output: apps/census/measurement.json · history.json',
  ].join('\n');
}

/** The gaps as a Markdown checklist, one section per dimension with any. */
export function gapsMarkdown(m: Measurement): string {
  const sections = DIMENSIONS.flatMap((d) => {
    const gaps = m.gaps.filter((g) => g.dimension === d);
    if (gaps.length === 0) return [];
    return [
      `## ${DIMENSION_LABEL[d]} (${gaps.length})\n\n${gaps.map((g) => `- [ ] ${g.title}`).join('\n')}`,
    ];
  });
  const head = `# Census · ${m.repo} · ${m.commit.slice(0, 7)} · ${utcDate(m.measuredAt)}`;
  return [head, ...sections].join('\n\n') + '\n';
}

export function overviewOf(m: Measurement, history: History): Overview {
  return {
    summary: summaryOf(m, history),
    coverage: coverageRows(m, history),
    metrics: metricRows(m, history),
    pyramid: pyramidOf(m),
    gapPills: gapPillsOf(m),
    stories: storiesOf(m),
    states: statesOf(m),
    trend: trendSeries(history),
    health: healthOf(m, history),
    dead: { rows: deadRows(m), boundariesConfigured: m.health.dead.boundaries === true },
    styling: stylingOf(m),
    hotspots: hotspotsOf(m),
    codeCoverage: codeCoverageOf(m),
    gaps: gapRows(m),
    notes: notesOf(m),
    rerun: rerunOf(m),
    exports: {
      jsonHref: `https://github.com/${m.repo}/raw/${m.commit}/apps/census/measurement.json`,
      markdown: gapsMarkdown(m),
    },
  };
}

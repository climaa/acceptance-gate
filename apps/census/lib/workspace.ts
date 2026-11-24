/**
 * `/[workspace]`, as plain data: one workspace of the measurement, detailed. The
 * home summarises; this page details. Pure, like the home's view models: every
 * figure is read off the committed measurement and the components only draw it.
 */
import type { IcicleNode, IcicleTone, MeterHue, StatTileState } from '@gate/ui';

import { gapAnchor } from './filter.ts';
import { blobHref } from './links.ts';
import {
  DIMENSIONS,
  type Dimension,
  type FileValue,
  type InventoryItem,
  type Measurement,
  type Workspace,
} from './measurement.ts';
import { kilo } from './overview.ts';
import { type TargetView, targetViews } from './targets.ts';
import { workspaceSlug } from './workspace-address.ts';

export { workspaceHref, workspaceParams, workspaceSlug } from './workspace-address.ts';
import { DIMENSION_LABEL } from './trend.ts';

/** The complexity ceiling the Health figure counts against (`scripts/complexity-gate.mjs`). */
const CEILING = 20;
const STORYBOOK = 'https://storybook.carloslima.dev';
const SET_VIEWER = 'https://visual-diff-ui.carloslima.dev/set/baselines';
const FILES_SHOWN = 12;
const INVENTORY_SHOWN = 10;

type Code = Workspace['dimensions']['code'];
type MeasuredCode = Extract<Code, { state: 'measured' }>;

export interface TileView {
  label: string;
  value: string;
  detail: string;
  state: StatTileState;
  meter?: { label: string; value: number | null; floor?: number; hue: MeterHue };
}

export interface LegendItem {
  label: string;
  tone: IcicleTone;
}

export type CodeSection =
  | { state: 'measured'; files: number; legend: LegendItem[]; root: IcicleNode }
  | { state: 'unmeasured' | 'not-applicable'; title: string; reason: string };

export type FileViewKey = 'crap' | 'coverage' | 'maintainability';

export interface FileView {
  value: FileViewKey;
  label: string;
  legend: LegendItem[];
  root: IcicleNode;
}

export interface HealthSection {
  title: string;
  caption: string;
  score: number;
  grade: string;
  source: string;
  /** The files drawn by CRAP, coverage and maintainability; empty where coverage is unmeasured. */
  views: FileView[];
  note: string;
  targets: TargetView[];
}

export interface FileRow {
  path: string;
  href: string;
  lines: number;
  covered: number;
  pct: string;
  tone: IcicleTone;
}

export interface GapGroup {
  dimension: Dimension;
  label: string;
  rows: { id: string; anchor: string; title: string; kind: string }[];
}

export interface InventoryRow {
  key: string;
  name: string;
  tier: string;
  story: boolean;
  tiled: boolean;
  baselined: boolean;
  links: { label: string; href: string }[];
}

export interface WorkspaceView {
  name: string;
  path: string;
  category: Workspace['category'];
  tools: string;
  tiles: TileView[];
  code: CodeSection;
  health: HealthSection | null;
  files: { rows: FileRow[]; total: number; more: string | null } | null;
  gaps: { count: number; groups: GapGroup[] };
  inventory: {
    heading: 'Components' | 'Screens';
    count: number;
    rows: InventoryRow[];
    more: string | null;
  } | null;
}

const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);
const thousands = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const oneDecimal = (n: number) => Math.round(n * 10) / 10;

const toolsLine = (m: Measurement) =>
  Object.entries(m.tools)
    .filter(([tool]) => tool !== 'node')
    .map(([tool, version]) => `${tool} ${version}`)
    .join(' · ');

const gapsIn = (m: Measurement, ws: Workspace, d?: Dimension) =>
  m.gaps.filter((g) => g.workspace === ws.name && (d === undefined || g.dimension === d));

/** `measured`, or `gaps` when the dimension has any open on this workspace. */
const stateOf = (m: Measurement, ws: Workspace, d: Dimension): StatTileState =>
  gapsIn(m, ws, d).length > 0 ? 'gaps' : 'measured';

const percentOf = (part: number, whole: number) =>
  whole === 0 ? 0 : oneDecimal((part / whole) * 100);

const METER_LABEL: Record<Dimension, string> = {
  code: 'Code: lines covered',
  visual: 'Visual: components complete',
  acceptance: 'Acceptance: visited by a scenario',
  health: 'Health: score of 100',
};
const HUE: Record<Dimension, MeterHue> = {
  code: 'chart',
  visual: 'chart-2',
  acceptance: 'chart-3',
  health: 'chart-4',
};

function codeTile(m: Measurement, ws: Workspace, code: MeasuredCode): TileView {
  const { covered, total, pct } = code.lines;
  const floor = code.floor === undefined ? '' : ` · floor ${code.floor}`;
  return {
    label: 'Code',
    value: `${pct}%`,
    detail: `${thousands(covered)} of ${thousands(total)} lines${floor}`,
    state: stateOf(m, ws, 'code'),
    meter: {
      label: METER_LABEL.code,
      value: pct,
      ...(code.floor === undefined ? {} : { floor: code.floor }),
      hue: HUE.code,
    },
  };
}

type MeasuredVisual = Extract<Workspace['dimensions']['visual'], { state: 'measured' }>;

function visualTile(m: Measurement, ws: Workspace, visual: MeasuredVisual): TileView {
  const { screens, components } = visual;
  const [part, whole, detail] =
    screens === undefined
      ? [
          Math.min(components.tiled, components.baselined),
          components.total,
          'components with a story, a tile and a baseline',
        ]
      : [
          Math.min(screens.tiled, screens.baselined),
          screens.stories,
          'screens with a tile and a baseline',
        ];
  return {
    label: 'Visual',
    value: `${part} / ${whole}`,
    detail,
    state: stateOf(m, ws, 'visual'),
    meter: { label: METER_LABEL.visual, value: percentOf(part, whole), hue: HUE.visual },
  };
}

type MeasuredValue = Extract<Workspace['dimensions'][Dimension], { state: 'measured' }>;

function measuredTile(m: Measurement, ws: Workspace, value: MeasuredValue): TileView {
  switch (value.dimension) {
    case 'code':
      return codeTile(m, ws, value);
    case 'visual':
      return visualTile(m, ws, value);
    case 'acceptance': {
      const n = value.features.length;
      const visited = value.scenarios > 0;
      return {
        label: 'Acceptance',
        value: String(value.scenarios),
        detail: `scenarios in ${n} ${plural(n, 'feature')}`,
        state: visited ? stateOf(m, ws, 'acceptance') : 'gaps',
        meter: {
          label: METER_LABEL.acceptance,
          value: visited ? 100 : 0,
          hue: HUE.acceptance,
        },
      };
    }
    case 'health': {
      const over = value.overCeiling;
      return {
        label: 'Health',
        value: `${over} over ${CEILING}`,
        detail:
          over === 0
            ? 'every function under the ceiling'
            : `${over} ${plural(over, 'function')} over the ceiling`,
        state: 'measured',
        meter: { label: METER_LABEL.health, value: value.score, hue: HUE.health },
      };
    }
  }
}

function tileOf(m: Measurement, ws: Workspace, d: Dimension): TileView {
  const value = ws.dimensions[d];
  const label = DIMENSION_LABEL[d];
  if (value.state === 'unmeasured')
    return {
      label,
      value: 'none',
      detail: value.reason,
      state: 'unmeasured',
      meter: { label: METER_LABEL[d], value: null, hue: HUE[d] },
    };
  if (value.state === 'not-applicable')
    return { label, value: '—', detail: value.reason, state: 'not-applicable' };
  return measuredTile(m, ws, value);
}

/* ── Files ───────────────────────────────────────────────────────────── */

const baseName = (path: string) => String(path.split('/').at(-1)).replace(/\.[^.]+$/, '');

const byLinesThenPath = (a: FileValue, b: FileValue) =>
  b.lines.total - a.lines.total || a.path.localeCompare(b.path, 'en');

function coverageTone(file: FileValue, floor: number | undefined): IcicleTone {
  if (file.lines.pct === 0) return 'danger';
  if (floor !== undefined && file.lines.pct < floor) return 'warning';
  return 'success';
}

function crapTone(crap: number): IcicleTone {
  if (crap < 15) return 'success';
  if (crap < 30) return 'warning';
  return 'danger';
}

/** A leaf's figure and colour in one view, or `null` where fallow has no figure. */
type Paint = (file: FileValue) => { detail: string; tone: IcicleTone } | null;

function fileTree(ws: Workspace, code: MeasuredCode, detail: string, paint: Paint) {
  const groups = new Map<string, FileValue[]>();
  for (const file of [...code.files].sort(byLinesThenPath)) {
    const group = file.group ?? '(root)';
    groups.set(group, [...(groups.get(group) ?? []), file]);
  }
  const lines = (files: readonly FileValue[]) => sum(files.map((f) => f.lines.total));
  const root: IcicleNode = {
    label: ws.name,
    detail: `${kilo(code.lines.total)} lines · ${detail}`,
    children: [...groups]
      .sort(([, a], [, b]) => lines(b) - lines(a))
      .map(([group, files]) => ({
        label: group,
        detail: `${kilo(lines(files))} lines`,
        children: files.map((file) => {
          const painted = paint(file);
          return {
            label: baseName(file.path),
            ...(painted === null ? {} : { detail: painted.detail }),
            weight: file.lines.total,
            tone: painted?.tone ?? 'neutral',
          };
        }),
      })),
  };
  return root;
}

const paintCoverage =
  (floor: number | undefined): Paint =>
  (file) => ({ detail: `${file.lines.pct}%`, tone: coverageTone(file, floor) });

const paintCrap: Paint = (file) =>
  file.crap === undefined
    ? null
    : { detail: `CRAP ${file.crap}`, tone: crapTone(file.crap) };

const paintMaintainability: Paint = (file) =>
  file.maintainability === undefined
    ? null
    : {
        detail: `maintainability ${file.maintainability}`,
        tone: file.maintainability < 70 ? 'warning' : 'success',
      };

function coverageLegend(floor: number | undefined): LegendItem[] {
  return [
    ...(floor === undefined
      ? [{ label: 'covered', tone: 'success' as const }]
      : [
          { label: 'at or over the floor', tone: 'success' as const },
          { label: 'under the floor', tone: 'warning' as const },
        ]),
    { label: '0%', tone: 'danger' },
  ];
}

const UNMEASURED_REASON =
  'This workspace configures no coverage, so no file can be drawn. Its first gap is the one that fixes that.';

function codeSection(ws: Workspace): CodeSection {
  const code = ws.dimensions.code;
  if (code.state === 'unmeasured')
    return { state: 'unmeasured', title: 'Not measured', reason: UNMEASURED_REASON };
  if (code.state === 'not-applicable')
    return { state: 'not-applicable', title: 'Nothing to measure', reason: code.reason };
  return {
    state: 'measured',
    files: code.files.length,
    legend: coverageLegend(code.floor),
    root: fileTree(
      ws,
      code,
      `${code.lines.pct}% lines covered`,
      paintCoverage(code.floor),
    ),
  };
}

function fileViews(ws: Workspace): FileView[] {
  const code = ws.dimensions.code;
  if (code.state !== 'measured') return [];
  return [
    {
      value: 'crap',
      label: 'CRAP',
      legend: [
        { label: 'under 15', tone: 'success' },
        { label: '15–30', tone: 'warning' },
        { label: '30 and over', tone: 'danger' },
      ],
      root: fileTree(ws, code, 'CRAP by file', paintCrap),
    },
    {
      value: 'coverage',
      label: 'Coverage',
      legend: coverageLegend(code.floor),
      root: fileTree(ws, code, 'coverage by file', paintCoverage(code.floor)),
    },
    {
      value: 'maintainability',
      label: 'Maintainability',
      legend: [
        { label: '70 and over', tone: 'success' },
        { label: 'under 70', tone: 'warning' },
      ],
      root: fileTree(ws, code, 'maintainability by file', paintMaintainability),
    },
  ];
}

/** `3 functions over the ceiling`, `no dead files`. */
const counted = (n: number, one: string, many: string) =>
  `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;

function healthSection(m: Measurement, ws: Workspace): HealthSection | null {
  const health = ws.dimensions.health;
  if (health.state !== 'measured') return null;
  const targets = targetViews(
    m,
    m.health.refactorTargets.filter((t) => t.path.startsWith(`${ws.path}/`)),
  );
  const found = [
    counted(
      health.overCeiling,
      'function over the ceiling',
      'functions over the ceiling',
    ),
    counted(health.deadFiles, 'dead file', 'dead files'),
    counted(health.deadExports, 'dead export', 'dead exports'),
    counted(targets.length, 'refactor target', 'refactor targets'),
  ];
  const crap =
    m.health.crapSource === 'estimated'
      ? 'CRAP is estimated until the measure step feeds coverage-final.json to fallow.'
      : 'CRAP is measured from coverage-final.json.';
  return {
    title: `Health · ${ws.name}`,
    caption: `fallow on this workspace alone: ${found.join(', ')}.`,
    score: health.score,
    grade: health.grade,
    source: m.tools.fallow === undefined ? 'of 100' : `of 100 · fallow ${m.tools.fallow}`,
    views: fileViews(ws),
    note: `${crap} Maintainability: under 70 is low.`,
    targets,
  };
}

/** The folder every path shares, `src/` for a package, or `''`. */
function sharedFolder(paths: readonly string[]): string {
  const first = paths[0]?.split('/') ?? [];
  let depth = 0;
  while (
    depth < first.length - 1 &&
    paths.every((p) => p.split('/')[depth] === first[depth])
  )
    depth += 1;
  return depth === 0 ? '' : `${first.slice(0, depth).join('/')}/`;
}

function filesTable(m: Measurement, ws: Workspace): WorkspaceView['files'] {
  const code = ws.dimensions.code;
  if (code.state !== 'measured') return null;
  const sorted = [...code.files].sort(byLinesThenPath);
  const shown = sorted.filter((f, i) => i < FILES_SHOWN || f.lines.pct < 100);
  const prefix = sharedFolder(code.files.map((f) => f.path));
  const folded = sorted.length - shown.length;
  return {
    total: sorted.length,
    rows: shown.map((f) => ({
      path: f.path.slice(prefix.length),
      href: blobHref(m, ws.path, f.path),
      lines: f.lines.total,
      covered: f.lines.covered,
      pct: `${f.lines.pct}%`,
      tone: coverageTone(f, code.floor),
    })),
    more: folded === 0 ? null : `${folded} more ${plural(folded, 'file')}, each at 100%`,
  };
}

function gapsOf(m: Measurement, ws: Workspace): WorkspaceView['gaps'] {
  const groups = DIMENSIONS.map((dimension) => ({
    dimension,
    label: DIMENSION_LABEL[dimension],
    rows: gapsIn(m, ws, dimension).map((g) => ({
      id: g.id,
      anchor: gapAnchor(g.id),
      title: g.title,
      kind: g.kind,
    })),
  })).filter((g) => g.rows.length > 0);
  return { count: sum(groups.map((g) => g.rows.length)), groups };
}

const complete = (item: InventoryItem) =>
  item.story !== undefined && item.tiled && item.baselined;

/** `screens-blog-about--default` → `about · default`. */
function screenName(ws: Workspace, story: string): string {
  const own = story.replace(new RegExp(`^screens-${workspaceSlug(ws)}-`), '');
  return own.replace('--', ' · ');
}

function inventoryRow(m: Measurement, ws: Workspace, item: InventoryItem): InventoryRow {
  const { story, board } = item;
  return {
    key: item.name,
    name: item.tier === 'screens' ? screenName(ws, item.name) : item.name,
    tier: item.tier,
    story: story !== undefined,
    tiled: item.tiled,
    baselined: item.baselined,
    links: [
      ...(story === undefined
        ? []
        : [{ label: 'Storybook', href: `${STORYBOOK}/?path=/story/${story}` }]),
      ...(board === undefined
        ? []
        : [{ label: 'board', href: blobHref(m, `designs/exports/${board}.png`) }]),
      ...(item.baselined
        ? [{ label: 'set', href: `${SET_VIEWER}#vd-tier-${item.tier}` }]
        : []),
    ],
  };
}

function inventoryOf(m: Measurement, ws: Workspace): WorkspaceView['inventory'] {
  const visual = ws.dimensions.visual;
  if (visual.state !== 'measured' || !visual.inventory?.length) return null;
  const items = visual.inventory;
  const screens = items.every((item) => item.tier === 'screens');
  const shown = items.filter((item, i) => i < INVENTORY_SHOWN || !complete(item));
  const folded = items.length - shown.length;
  const noun = screens ? 'screen' : 'component';
  return {
    heading: screens ? 'Screens' : 'Components',
    count: items.length,
    rows: shown.map((item) => inventoryRow(m, ws, item)),
    more:
      folded === 0 ? null : `${folded} more ${plural(folded, noun)}, each with all three`,
  };
}

/** The page at `/<slug>`, or `null` when no workspace lives there. */
export function workspaceView(m: Measurement, slug: string): WorkspaceView | null {
  const ws = m.workspaces.find((w) => workspaceSlug(w) === slug);
  if (ws === undefined) return null;
  return {
    name: ws.name,
    path: ws.path,
    category: ws.category,
    tools: toolsLine(m),
    tiles: DIMENSIONS.map((d) => tileOf(m, ws, d)),
    code: codeSection(ws),
    health: healthSection(m, ws),
    files: filesTable(m, ws),
    gaps: gapsOf(m, ws),
    inventory: inventoryOf(m, ws),
  };
}

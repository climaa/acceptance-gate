/**
 * The small decisions between collecting and writing: which category a workspace
 * is in, what one history point says, how a new point joins the history, and the
 * gap tally the measure step prints.
 */
import { FEATURE_MAP, type FeatureMap } from './features.ts';
import {
  GAP_KINDS,
  type Category,
  type Gap,
  type GapKind,
  type History,
  type HistoryPoint,
  type Measurement,
} from './measurement.ts';
import type { StoryPart } from './gaps.ts';

/** Code fallow and the gate measure by path, never a package: named by the path and a slash. */
export const PSEUDO_WORKSPACES = [
  { name: 'scripts/', path: 'scripts' },
  { name: '.sandcastle/', path: '.sandcastle' },
  {
    name: '.claude/skills/pixel-perfect-session/',
    path: '.claude/skills/pixel-perfect-session',
  },
] as const;

export function categoryOf(path: string): Category {
  if (path.startsWith('packages/')) return 'packages';
  if (path.startsWith('apps/')) return 'apps';
  return 'scripts';
}

const percent = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;

/** Visual's headline: the share of stories lacking neither tile nor baseline. */
export function visualHeadline(
  parts: readonly { storyId: string; missing: readonly StoryPart[] }[],
): number | null {
  return parts.length === 0
    ? null
    : percent(parts.filter((p) => p.missing.length === 0).length, parts.length);
}

function codeHeadline(measurement: Measurement): number | null {
  let covered = 0;
  let total = 0;
  for (const ws of measurement.workspaces) {
    const code = ws.dimensions.code;
    if (code.state !== 'measured') continue;
    covered += code.lines.covered;
    total += code.lines.total;
  }
  return total === 0 ? null : percent(covered, total);
}

/** Acceptance's headline: the share of deployed apps at least one scenario visits. */
function acceptanceHeadline(measurement: Measurement, map: FeatureMap): number | null {
  const apps = new Set<string>(Object.values(map.apps));
  const values = measurement.workspaces
    .filter((ws) => apps.has(ws.path))
    .map((ws) => ws.dimensions.acceptance)
    .filter((value) => value.state === 'measured');
  return values.length === 0
    ? null
    : percent(values.filter((v) => v.scenarios > 0).length, values.length);
}

/** What the measurement adds to the history; the rest the caller measured beside it. */
export function historyPoint(
  measurement: Measurement,
  extra: { visual: number | null; dupPct: number; overCeiling: number },
  map: FeatureMap = FEATURE_MAP,
): HistoryPoint {
  return {
    commit: measurement.commit,
    measuredAt: measurement.measuredAt,
    dimensions: {
      code: codeHeadline(measurement),
      visual: extra.visual,
      acceptance: acceptanceHeadline(measurement, map),
      health: measurement.health.score,
    },
    fallow: {
      score: measurement.health.score,
      grade: measurement.health.grade,
      dupPct: extra.dupPct,
      crapOver: measurement.health.crapOver30,
      overCeiling: extra.overCeiling,
      deadFiles: measurement.health.dead.files,
    },
  };
}

/** The history with this point: appended, or replacing the point a re-measured commit had. */
export function withPoint(history: History | undefined, point: HistoryPoint): History {
  const points = (history?.points ?? []).filter((p) => p.commit !== point.commit);
  return { schema: 1, points: [...points, point] };
}

export function gapCounts(gaps: readonly Gap[]): Record<GapKind, number> {
  const counts = Object.fromEntries(GAP_KINDS.map((kind) => [kind, 0])) as Record<
    GapKind,
    number
  >;
  for (const gap of gaps) counts[gap.kind] += 1;
  return counts;
}

/** The gap ids a new measurement opens and closes against the committed one. */
export function gapDiff(before: readonly Gap[] | undefined, after: readonly Gap[]) {
  const was = new Set((before ?? []).map((g) => g.id));
  const is = new Set(after.map((g) => g.id));
  return {
    opened: [...is].filter((id) => !was.has(id)),
    closed: [...was].filter((id) => !is.has(id)),
  };
}

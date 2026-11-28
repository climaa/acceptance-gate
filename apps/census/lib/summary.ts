/**
 * The summary card: the four lines a reader should take away before anything
 * else. Each is written only when its condition holds, so a repository with
 * nothing to say on a point says nothing rather than a zero.
 */
import { utcDate } from './dates.ts';
import { FEATURE_MAP, type FeatureMap } from './features.ts';
import {
  appsByPath,
  appShare,
  componentsOf,
  staticReach,
  unmeasuredCode,
} from './figures.ts';
import {
  DIMENSIONS,
  type Dimension,
  type History,
  type Measurement,
} from './measurement.ts';
import { DIMENSION_LABEL, WINDOW_DAYS, deltaOf } from './trend.ts';

export interface Highlight {
  /** `alert` leads with the alert badge; a dimension, with its key colour. */
  tone: 'alert' | Dimension;
  text: string;
}

export interface Summary {
  caption: string;
  highlights: Highlight[];
}

function storyDetail(m: Measurement, map: FeatureMap): string | undefined {
  const [widest] = [...componentsOf(m)].sort((a, b) => b.unstoried - a.unstoried);
  if (widest === undefined || widest.unstoried === 0) return undefined;
  const owner = appsByPath(map)[widest.ws.path] ?? widest.ws.name;
  return `${widest.unstoried} of ${widest.total} ${owner} components have no story`;
}

function widestGap(m: Measurement, map: FeatureMap): Highlight[] {
  const counts = DIMENSIONS.map((d) => ({
    d,
    n: m.gaps.filter((g) => g.dimension === d).length,
  }));
  const [top] = [...counts].sort((a, b) => b.n - a.n);
  if (top === undefined || top.n === 0) return [];
  const detail =
    (top.d === 'visual' ? storyDetail(m, map) : undefined) ??
    `${top.n} of the ${m.gaps.length} gaps`;
  return [
    { tone: 'alert', text: `${DIMENSION_LABEL[top.d]} is the widest gap: ${detail}.` },
  ];
}

function unmeasuredNotUntested(m: Measurement): Highlight[] {
  const reach = staticReach(m);
  if (unmeasuredCode(m).length === 0 || reach === null) return [];
  return [
    {
      tone: 'code',
      text: `Most red coverage is unmeasured, not untested: ${reach}% of files are reached by a test.`,
    },
  ];
}

function biggestRise(m: Measurement, history: History, map: FeatureMap): Highlight[] {
  const rises = DIMENSIONS.map((d) => ({
    d,
    delta: deltaOf(history.points, (p) => p.dimensions[d]) ?? 0,
  }));
  const [top] = [...rises].sort((a, b) => b.delta - a.delta);
  if (top === undefined || top.delta <= 0) return [];
  const value = history.points.at(-1)?.dimensions[top.d];
  const apps = appShare(m, map);
  const detail =
    top.d === 'acceptance'
      ? `: ${apps.part} of ${apps.whole} apps now have a scenario`
      : `, to ${value}%`;
  return [
    {
      tone: top.d,
      text: `${DIMENSION_LABEL[top.d]} rose ${top.delta} points in ${WINDOW_DAYS} days${detail}.`,
    },
  ];
}

function healthCost(m: Measurement): Highlight {
  const { score, grade, penalties } = m.health;
  const lost = Math.round(penalties.reduce((a, p) => a + p.points, 0) * 10) / 10;
  const [worst] = [...penalties].sort((a, b) => b.points - a.points);
  const cost =
    worst === undefined || lost === 0
      ? ''
      : ` ${worst.name} costs ${worst.points} of the ${lost} points it loses.`;
  return { tone: 'health', text: `Health ${score} ${grade}.${cost}` };
}

export function summaryOf(
  m: Measurement,
  history: History,
  map: FeatureMap = FEATURE_MAP,
): Summary {
  return {
    caption: `What changed and what to file first · measured ${utcDate(m.measuredAt)} at ${m.commit.slice(0, 7)}.`,
    highlights: [
      ...widestGap(m, map),
      ...unmeasuredNotUntested(m),
      ...biggestRise(m, history, map),
      healthCost(m),
    ],
  };
}

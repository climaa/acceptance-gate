/**
 * What the shell and the home draw, as plain data: the components take these
 * and own no rule of their own. Pure — `now` is the caller's, so the stale rule
 * is decided once, at build.
 */
import type { Committed } from './committed.ts';
import {
  CATEGORIES,
  DIMENSIONS,
  type Dimension,
  type Measurement,
  type Workspace,
} from './measurement.ts';
import { utcDate } from './dates.ts';
import { overviewOf, type Overview } from './overview.ts';
import { searchIndex, type SearchIndex } from './search.ts';
import { ageInDays, isStale } from './stale.ts';
import { workspaceHref } from './workspace-address.ts';

/** The repository census measures, for the GitHub link before any measurement. */
export const REPOSITORY = 'climaa/acceptance-gate';

const DIMENSION_LABEL: Record<Dimension, string> = {
  code: 'Code',
  visual: 'Visual',
  acceptance: 'Acceptance',
  health: 'Health',
};

/** The runtime is recorded beside the tools but measures nothing. */
const RUNTIMES = new Set(['node']);

/** One sidebar row: the overview, or a dimension with its open gaps. */
export interface ShellDimension {
  id: 'overview' | Dimension;
  label: string;
  href: string;
  /** Open gaps; absent when nothing is measured. */
  count?: number;
  current: boolean;
}

/** One sidebar workspace row, grouped by its category. */
export interface ShellWorkspace {
  name: string;
  href: string;
  category: Workspace['category'];
  /** Its Code dimension's state: gaps and the coverage floor never change it. */
  status: Workspace['dimensions']['code']['state'];
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface MeasurementMeta {
  commit: { short: string; href: string };
  /** `21 Nov 2026`, in UTC. */
  date: string;
  /** The measurement's age in days when it is stale, else `null`. */
  staleDays: number | null;
  /** `vitest 5.0.5`, one per measuring tool, in the file's order. */
  tools: string[];
}

interface ViewBase {
  dimensions: ShellDimension[];
  workspaces: ShellWorkspace[];
  githubHref: string;
  /** The measured repository's name, `acceptance-gate` before any measurement. */
  repoName: string;
}

export type HomeView =
  | (ViewBase & { state: 'empty' })
  | (ViewBase & {
      state: 'measured';
      filters: {
        dimensions: FilterOption[];
        /** The same, without the counts: what a phone's band has room for. */
        dimensionsShort: FilterOption[];
        categories: FilterOption[];
      };
      meta: MeasurementMeta;
      overview: Overview;
      search: SearchIndex;
    });

const githubOf = (repo: string) => `https://github.com/${repo}`;
/** `climaa/acceptance-gate` → `acceptance-gate`. */
const nameOf = (repo: string) => String(repo.split('/').at(-1));

function gapCounts(measurement: Measurement) {
  const counts = Object.fromEntries(DIMENSIONS.map((d) => [d, 0])) as Record<
    Dimension,
    number
  >;
  for (const gap of measurement.gaps) counts[gap.dimension] += 1;
  return { total: measurement.gaps.length, counts };
}

function shellDimensions(measurement: Measurement | null): ShellDimension[] {
  const gaps = measurement === null ? null : gapCounts(measurement);
  return [
    { id: 'overview', label: 'Overview', href: '/', count: gaps?.total, current: true },
    ...DIMENSIONS.map((dimension) => ({
      id: dimension,
      label: DIMENSION_LABEL[dimension],
      href: `/?dimension=${dimension}`,
      count: gaps?.counts[dimension],
      current: false,
    })),
  ];
}

function metaOf(measurement: Measurement, now: number): MeasurementMeta {
  return {
    commit: {
      short: measurement.commit.slice(0, 7),
      href: `${githubOf(measurement.repo)}/commit/${measurement.commit}`,
    },
    date: utcDate(measurement.measuredAt),
    staleDays: isStale(measurement.measuredAt, now)
      ? ageInDays(measurement.measuredAt, now)
      : null,
    tools: Object.entries(measurement.tools)
      .filter(([tool]) => !RUNTIMES.has(tool))
      .map(([tool, version]) => `${tool} ${version}`),
  };
}

function shellWorkspaces(measurement: Measurement): ShellWorkspace[] {
  return measurement.workspaces.map((ws) => ({
    name: ws.name,
    href: workspaceHref(ws),
    category: ws.category,
    status: ws.dimensions.code.state,
  }));
}

function filtersOf(measurement: Measurement) {
  const { total, counts } = gapCounts(measurement);
  return {
    dimensions: [
      { value: 'all', label: `All ${total}` },
      ...DIMENSIONS.map((d) => ({
        value: d,
        label: `${DIMENSION_LABEL[d]} ${counts[d]}`,
      })),
    ],
    dimensionsShort: [
      { value: 'all', label: 'All' },
      ...DIMENSIONS.map((d) => ({ value: d, label: DIMENSION_LABEL[d] })),
    ],
    categories: [
      { value: 'all', label: 'All' },
      ...CATEGORIES.map((category) => ({ value: category, label: category })),
    ],
  };
}

/** The home's view of what is committed, at build time `now`. */
export function homeView(committed: Committed, now: number): HomeView {
  if (committed.state === 'empty') {
    return {
      state: 'empty',
      dimensions: shellDimensions(null),
      workspaces: [],
      githubHref: githubOf(REPOSITORY),
      repoName: nameOf(REPOSITORY),
    };
  }
  const { measurement, history, map, source } = committed;
  return {
    state: 'measured',
    dimensions: shellDimensions(measurement),
    workspaces: shellWorkspaces(measurement),
    githubHref: githubOf(measurement.repo),
    repoName: nameOf(measurement.repo),
    filters: filtersOf(measurement),
    meta: metaOf(measurement, now),
    overview: overviewOf(measurement, history, { map, local: source === 'local' }),
    search: searchIndex(measurement, map),
  };
}

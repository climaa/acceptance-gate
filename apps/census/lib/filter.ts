/**
 * The home's two filters, `?dimension=` and `?category=`, as data. The page is
 * prerendered once, unfiltered; the reader's query is applied in the browser by
 * these functions, so a filtered home needs no server and no second build.
 */
import {
  CATEGORIES,
  DIMENSIONS,
  type Category,
  type Dimension,
  type Measurement,
} from './measurement.ts';
import { workspaceHref } from './workspace-address.ts';

export interface HomeFilter {
  dimension: Dimension | null;
  category: Category | null;
}

export const NO_FILTER: HomeFilter = { dimension: null, category: null };

/** One gap as the gap list draws it. */
export interface GapRow {
  id: string;
  /** The row's element id, which the search palette links to. */
  anchor: string;
  dimension: Dimension;
  category: Category;
  kind: string;
  title: string;
  workspace: string;
  workspaceHref: string;
}

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null =>
  values.find((v) => v === value) ?? null;

/** The filter a query names; a value that names nothing is no filter. */
export function parseFilter(params: { get(name: string): string | null }): HomeFilter {
  return {
    dimension: oneOf(DIMENSIONS, params.get('dimension')),
    category: oneOf(CATEGORIES, params.get('category')),
  };
}

export const gapAnchor = (id: string) => `gap-${id}`;

/** Every gap, in the file's order, with the category of its workspace. */
export function gapRows(measurement: Measurement): GapRow[] {
  const workspaces = new Map(measurement.workspaces.map((ws) => [ws.name, ws]));
  return measurement.gaps.map((gap) => {
    // `validate.ts` refuses a gap naming no workspace, so the lookup holds.
    const ws = workspaces.get(gap.workspace)!;
    return {
      id: gap.id,
      anchor: gapAnchor(gap.id),
      dimension: gap.dimension,
      category: ws.category,
      kind: gap.kind,
      title: gap.title,
      workspace: gap.workspace,
      workspaceHref: workspaceHref(ws),
    };
  });
}

/** The gaps the filter keeps. */
export function filterGaps<T extends Pick<GapRow, 'dimension' | 'category'>>(
  rows: readonly T[],
  filter: HomeFilter,
): T[] {
  return rows.filter(
    (row) =>
      (filter.dimension === null || row.dimension === filter.dimension) &&
      (filter.category === null || row.category === filter.category),
  );
}

/** The home's address with `change` applied over `filter`; the bare `/` when nothing is left. */
export function filterHref(filter: HomeFilter, change: Partial<HomeFilter>): string {
  const next = { ...filter, ...change };
  const query = (['dimension', 'category'] as const)
    .filter((key) => next[key] !== null)
    .map((key) => `${key}=${next[key]}`)
    .join('&');
  return query === '' ? '/' : `/?${query}`;
}

export interface FilterChip {
  label: string;
  /** The home without this key. */
  href: string;
}

/** One removable chip per key the filter sets. */
export function filterChips(filter: HomeFilter): FilterChip[] {
  return (['dimension', 'category'] as const).flatMap((key) => {
    const value = filter[key];
    return value === null
      ? []
      : [{ label: `${key}: ${value}`, href: filterHref(filter, { [key]: null }) }];
  });
}

/**
 * What the frame around every page draws at an address: the breadcrumb, which
 * sidebar row is current, and which band sits under the top bar. Pure, so the
 * shell only reads it: the home lights a dimension and offers the filters; a
 * workspace page lights its workspace and only dates the measurement.
 */
import type { HomeFilter } from './filter.ts';
import type { HomeView, ShellDimension, ShellWorkspace } from './home.ts';
import { DIMENSION_LABEL } from './trend.ts';

export interface Crumb {
  label: string;
  href?: string;
}

export interface FrameView {
  breadcrumb: Crumb[];
  dimensions: ShellDimension[];
  workspaces: (ShellWorkspace & { current: boolean })[];
  /** `filters` on the home; `meta` where there is nothing to filter. */
  band: 'filters' | 'meta';
}

const trimmed = (pathname: string) =>
  pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

export function frameAt(view: HomeView, filter: HomeFilter, pathname: string): FrameView {
  const root: Crumb[] = [
    { label: view.repoName, href: view.githubHref },
    { label: 'census', href: '/' },
  ];
  const here = view.workspaces.find((ws) => ws.href === trimmed(pathname));
  if (here !== undefined) {
    return {
      breadcrumb: [
        ...root,
        { label: here.category, href: `/?category=${here.category}` },
        { label: here.name },
      ],
      dimensions: view.dimensions.map((d) => ({ ...d, current: false })),
      workspaces: view.workspaces.map((ws) => ({ ...ws, current: ws === here })),
      band: 'meta',
    };
  }
  const lit = filter.dimension ?? 'overview';
  return {
    breadcrumb: [
      ...root,
      {
        label: filter.dimension === null ? 'Overview' : DIMENSION_LABEL[filter.dimension],
      },
    ],
    dimensions: view.dimensions.map((d) => ({ ...d, current: d.id === lit })),
    workspaces: view.workspaces.map((ws) => ({ ...ws, current: false })),
    band: 'filters',
  };
}

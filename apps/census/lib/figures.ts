/**
 * The counts behind each dimension's headline, read off the workspaces. The
 * headline percentages themselves are the history's latest point, which the
 * measure step wrote; these are the "N of M" a reader checks them against.
 */
import { FEATURE_MAP, type FeatureMap } from './features.ts';
import type { Measurement, Workspace } from './measurement.ts';

export interface Share {
  part: number;
  whole: number;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;
const sum = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0);

/** The app each deployed workspace is published as, by workspace path. */
export const appsByPath = (
  map: FeatureMap = FEATURE_MAP,
): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(map.apps).map(([app, path]) => [path, app]));

const measuredCode = (m: Measurement) =>
  m.workspaces.flatMap((ws) =>
    ws.dimensions.code.state === 'measured' ? [ws.dimensions.code] : [],
  );

/** The workspaces whose coverage nothing measures. */
export const unmeasuredCode = (m: Measurement): Workspace[] =>
  m.workspaces.filter((ws) => ws.dimensions.code.state === 'unmeasured');

/** Share of files some test imports, over the measured workspaces, weighted by their lines. */
export function staticReach(m: Measurement): number | null {
  const code = measuredCode(m);
  const lines = sum(code.map((c) => c.lines.total));
  if (lines === 0) return null;
  return oneDecimal(sum(code.map((c) => c.staticReachPct * c.lines.total)) / lines);
}

const visualOf = (m: Measurement) =>
  m.workspaces.flatMap((ws) =>
    ws.dimensions.visual.state === 'measured'
      ? [{ ws, visual: ws.dimensions.visual }]
      : [],
  );

/** Stories with a tile and a baseline, of every story: components' and screens'. */
export function storyShare(m: Measurement): Share {
  const parts = visualOf(m).flatMap(({ visual }) => [
    {
      part: Math.min(visual.components.tiled, visual.components.baselined),
      whole: visual.components.storied,
    },
    ...(visual.screens === undefined
      ? []
      : [
          {
            part: Math.min(visual.screens.tiled, visual.screens.baselined),
            whole: visual.screens.stories,
          },
        ]),
  ]);
  return { part: sum(parts.map((p) => p.part)), whole: sum(parts.map((p) => p.whole)) };
}

/** Components no story renders, of every component. */
export function unstoriedShare(m: Measurement): Share {
  const comps = visualOf(m).map(({ visual }) => visual.components);
  return {
    part: sum(comps.map((c) => c.total - c.storied)),
    whole: sum(comps.map((c) => c.total)),
  };
}

/** Per workspace with components, its total and how many no story renders. */
export function componentsOf(m: Measurement) {
  return visualOf(m)
    .filter(({ visual }) => visual.components.total > 0)
    .map(({ ws, visual }) => ({
      ws,
      total: visual.components.total,
      unstoried: visual.components.total - visual.components.storied,
    }));
}

/** Deployed apps a scenario visits, of the deployed apps measured. */
export function appShare(m: Measurement, map: FeatureMap = FEATURE_MAP): Share {
  const appOf = appsByPath(map);
  const apps = m.workspaces.filter(
    (ws) => appOf[ws.path] !== undefined && ws.dimensions.acceptance.state === 'measured',
  );
  const visited = apps.filter(
    (ws) =>
      ws.dimensions.acceptance.state === 'measured' &&
      ws.dimensions.acceptance.scenarios > 0,
  );
  return { part: visited.length, whole: apps.length };
}

/** Scopes with no function over the complexity ceiling, of the scopes Health measures. */
export function scopeShare(m: Measurement): Share {
  const scopes = m.workspaces.flatMap((ws) =>
    ws.dimensions.health.state === 'measured' ? [ws.dimensions.health] : [],
  );
  return { part: scopes.filter((h) => h.overCeiling === 0).length, whole: scopes.length };
}

/** Each route state across the measured apps: own, inherited and none, summed. */
export function routeStates(m: Measurement, map: FeatureMap = FEATURE_MAP) {
  const appOf = appsByPath(map);
  const routes = visualOf(m).flatMap(({ ws, visual }) =>
    visual.routes === undefined ? [] : [{ ws, routes: visual.routes }],
  );
  const total = (key: 'loading' | 'error' | 'notFound') => ({
    own: sum(routes.map((r) => r.routes[key].own)),
    inherited: sum(routes.map((r) => r.routes[key].inherited)),
    none: sum(routes.map((r) => r.routes[key].none)),
  });
  return {
    total: sum(routes.map((r) => r.routes.total)),
    apps: routes.map((r) => appOf[r.ws.path] ?? r.ws.name),
    loading: total('loading'),
    error: total('error'),
    notFound: total('notFound'),
  };
}

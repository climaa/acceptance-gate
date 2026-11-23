/**
 * Where a workspace's page lives. Its own module because the home's sidebar, its
 * search and its gap rows link here, and the page's view model imports them.
 */
import type { Measurement, Workspace } from './measurement.ts';

/** The page's address segment: the path's last segment, a hidden directory's dot dropped. */
export function workspaceSlug(ws: Pick<Workspace, 'path'>): string {
  return ws.path.slice(ws.path.lastIndexOf('/') + 1).replace(/^\.+/, '');
}

export const workspaceHref = (ws: Pick<Workspace, 'path'>) => `/${workspaceSlug(ws)}`;

/** Every workspace and pseudo-workspace, one page each. Two sharing an address is a fault. */
export function workspaceParams(m: Measurement): { workspace: string }[] {
  const seen = new Map<string, string>();
  for (const ws of m.workspaces) {
    const slug = workspaceSlug(ws);
    const other = seen.get(slug);
    if (other !== undefined)
      throw new Error(`${other} and ${ws.name} would both be at /${slug}`);
    seen.set(slug, ws.name);
  }
  return [...seen.keys()].map((workspace) => ({ workspace }));
}

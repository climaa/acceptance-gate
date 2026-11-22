import type { SidebarCategory, SidebarWorkspace } from './Sidebar';

/** The order the tile draws the groups in (CONTEXT.md, _category_). */
const CATEGORY_ORDER: readonly SidebarCategory[] = ['packages', 'apps', 'scripts'];

export interface WorkspaceGroup {
  category: SidebarCategory;
  workspaces: SidebarWorkspace[];
}

/**
 * The workspaces under their categories, in category order, each group keeping
 * the caller's order. A category with no workspace has no group, so the sidebar
 * never draws a heading over nothing.
 */
export function groupWorkspaces(
  workspaces: readonly SidebarWorkspace[],
): WorkspaceGroup[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    workspaces: workspaces.filter((workspace) => workspace.category === category),
  })).filter((group) => group.workspaces.length > 0);
}

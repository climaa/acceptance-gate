import { describe, expect, it } from 'vitest';

import { groupWorkspaces } from './groups';
import type { SidebarWorkspace } from './Sidebar';

const ws = (name: string, category: SidebarWorkspace['category']): SidebarWorkspace => ({
  name,
  href: `/${name}`,
  category,
  status: 'clear',
});

describe('groupWorkspaces', () => {
  it('orders the groups packages, apps, scripts whatever order the workspaces come in', () => {
    const workspaces = [
      ws('scripts/', 'scripts'),
      ws('@gate/blog', 'apps'),
      ws('@gate/ui', 'packages'),
    ];

    const groups = groupWorkspaces(workspaces);

    expect(groups.map((group) => group.category)).toEqual([
      'packages',
      'apps',
      'scripts',
    ]);
  });

  it('keeps the caller’s order inside a group', () => {
    const workspaces = [
      ws('@gate/ui', 'packages'),
      ws('@gate/blog', 'apps'),
      ws('@gate/links', 'packages'),
    ];

    const [packages] = groupWorkspaces(workspaces);

    expect(packages?.workspaces.map((workspace) => workspace.name)).toEqual([
      '@gate/ui',
      '@gate/links',
    ]);
  });

  it('leaves out a category with no workspace', () => {
    const workspaces = [ws('@gate/ui', 'packages')];

    const groups = groupWorkspaces(workspaces);

    expect(groups.map((group) => group.category)).toEqual(['packages']);
  });

  it('returns no group for no workspaces', () => {
    const groups = groupWorkspaces([]);

    expect(groups).toEqual([]);
  });
});

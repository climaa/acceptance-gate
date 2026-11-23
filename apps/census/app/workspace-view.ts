import { cacheLife } from 'next/cache';

import { readCommitted } from '@/lib/committed.ts';
import { workspaceParams, workspaceView, type WorkspaceView } from '@/lib/workspace.ts';

/**
 * A workspace page's view of the committed measurement, cached for the same
 * reason and as long as the home's (`home-view.ts`): every page reads the same
 * file, and the frame around it already asks for the home's view.
 */
export async function loadWorkspaceView(slug: string): Promise<WorkspaceView | null> {
  'use cache';
  cacheLife('days');
  const committed = readCommitted(process.cwd());
  return committed.state === 'measured'
    ? workspaceView(committed.measurement, slug)
    : null;
}

/** One page per workspace and pseudo-workspace the committed measurement lists. */
export async function loadWorkspaceParams(): Promise<{ workspace: string }[]> {
  'use cache';
  cacheLife('days');
  const committed = readCommitted(process.cwd());
  return committed.state === 'measured' ? workspaceParams(committed.measurement) : [];
}

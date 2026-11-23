import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { WorkspaceScreen } from '@/components/WorkspaceScreen';
import { pageMetadata } from '@/lib/share.ts';
import { SITE_TITLE } from '@/lib/site.ts';
import { loadWorkspaceParams, loadWorkspaceView } from '../workspace-view';

export async function generateStaticParams() {
  return loadWorkspaceParams();
}

export async function generateMetadata({
  params,
}: PageProps<'/[workspace]'>): Promise<Metadata> {
  const { workspace } = await params;
  const view = await loadWorkspaceView(workspace);
  if (view === null) return { title: SITE_TITLE };

  return pageMetadata({
    path: `/${workspace}`,
    title: `${view.name} · ${SITE_TITLE}`,
    description: `What ${view.name}'s tests, stories, scenarios and code health cover, and every gap left to file.`,
  });
}

export default async function WorkspacePage({ params }: PageProps<'/[workspace]'>) {
  const view = await loadWorkspaceView((await params).workspace);
  if (view === null) notFound();
  return <WorkspaceScreen view={view} />;
}

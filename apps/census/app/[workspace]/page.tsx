import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { WorkspaceScreen } from '@/components/WorkspaceScreen';
import { loadWorkspaceParams, loadWorkspaceView } from '../workspace-view';

export async function generateStaticParams() {
  return loadWorkspaceParams();
}

export async function generateMetadata({
  params,
}: PageProps<'/[workspace]'>): Promise<Metadata> {
  const view = await loadWorkspaceView((await params).workspace);
  return { title: view === null ? 'Census' : `${view.name} · Census` };
}

export default async function WorkspacePage({ params }: PageProps<'/[workspace]'>) {
  const view = await loadWorkspaceView((await params).workspace);
  if (view === null) notFound();
  return <WorkspaceScreen view={view} />;
}

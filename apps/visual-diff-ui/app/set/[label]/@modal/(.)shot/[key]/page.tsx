import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShotContents } from '@/components/ShotContents';
import { shotMetadata } from '@/lib/shot-meta';

export async function generateMetadata({
  params,
}: PageProps<'/set/[label]/shot/[key]'>): Promise<Metadata> {
  return shotMetadata(params);
}

/**
 * A screenshot opened from its set: the modal alone, over the set the layout
 * keeps mounted. A fallback of nothing, for the reason the comparison's
 * intercepted page gives — the set is already on screen.
 */
export default function InterceptedShot({
  params,
}: PageProps<'/set/[label]/shot/[key]'>) {
  return (
    <Suspense fallback={null}>
      <ShotContents params={params} entry="set" />
    </Suspense>
  );
}

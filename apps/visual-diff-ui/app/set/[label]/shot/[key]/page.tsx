import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@gate/ui';
import { ShotContents } from '@/components/ShotContents';
import { shotMetadata } from '@/lib/shot-meta';

export async function generateMetadata({
  params,
}: PageProps<'/set/[label]/shot/[key]'>): Promise<Metadata> {
  return shotMetadata(params);
}

/**
 * A screenshot loaded cold — a shared link, a refresh: the shot view as the
 * page, expanded, with the way back to its set in place of a close button.
 *
 * Not the set with a modal over it, as a cold comparison is the report with
 * one: a set is hundreds of screenshots, and reading a single one is the whole
 * reason the address was followed.
 */
export default function ShotPage({ params }: PageProps<'/set/[label]/shot/[key]'>) {
  return (
    <Suspense fallback={<Skeleton lines={4} />}>
      <ShotContents params={params} entry="direct" />
    </Suspense>
  );
}

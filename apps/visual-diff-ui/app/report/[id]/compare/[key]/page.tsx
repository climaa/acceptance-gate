import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { ComparisonContents } from '@/components/ComparisonContents';
import { comparisonMetadata } from '@/lib/comparison-meta';
import { ReportContents } from '@/components/ReportContents';

export async function generateMetadata({
  params,
}: PageProps<'/report/[id]/compare/[key]'>): Promise<Metadata> {
  return comparisonMetadata(params);
}

/**
 * A comparison loaded cold — a shared link, a refresh: its report, with the
 * modal already open over it.
 *
 * The report rather than a page of its own, because x-visual-diff-pages draws the modal
 * over the report and nowhere else, and because closing it should leave the
 * reader somewhere: in the run the comparison belongs to.
 */
export default function ComparisonPage({
  params,
}: PageProps<'/report/[id]/compare/[key]'>) {
  return (
    <Stack gap={6}>
      <Suspense fallback={<Skeleton lines={4} />}>
        <ReportContents params={params} />
      </Suspense>

      <Suspense fallback={null}>
        <ComparisonContents params={params} entry="direct" />
      </Suspense>
    </Stack>
  );
}

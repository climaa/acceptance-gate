import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { ReportTemplate } from '@/components/ReportTemplate';
import { readReport, readSets, resolveDataDir } from '@/lib/data';

/**
 * The report route: one comparison, read and handed to the template.
 *
 * The page resolves the data directory and awaits the readers, and does nothing
 * else — everything a reviewer touches is below, where it can be rendered from
 * literal rows without a filesystem.
 */

export default function ReportPage({ params }: PageProps<'/report/[id]'>) {
  return (
    <Stack gap={6}>
      {/* `params` is request data and the summary is read per request, so the
          whole body is a dynamic hole — awaited inside the boundary, never
          above it, or the route would have no static shell at all. The review
          loop reads the query string under this same boundary, with
          `useSearchParams()`; the page's own `searchParams` prop is never
          touched, which is what keeps that shell cacheable. */}
      <Suspense fallback={<Skeleton lines={4} />}>
        <ReportContents params={params} />
      </Suspense>
    </Stack>
  );
}

async function ReportContents({ params }: Pick<PageProps<'/report/[id]'>, 'params'>) {
  const { id } = await params;
  const { dir } = await resolveDataDir();
  const [report, registry] = await Promise.all([readReport(dir, id), readSets(dir)]);

  // A report id that never existed, and one that climbed out of the data
  // directory, land here the same way: nothing to show, nothing to say about
  // why. lib/data.ts refuses the second before any file is opened.
  if (!report) notFound();

  return <ReportTemplate id={id} report={report} sets={registry.sets} />;
}

import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Badge, Skeleton, Stack } from '@gate/ui';
import { readReport, resolveDataDir } from '@/lib/data';
import { BUCKETS } from '@/lib/summary';

/**
 * The report route, as far as this issue builds it: the summary is read,
 * validated and counted. The three-up viewer, the review loop and the
 * accessibility section are later issues.
 */

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Stack gap={6}>
      {/* `params` is request data and the summary is read per request, so the
          whole body is a dynamic hole — awaited inside the boundary, never
          above it, or the route would have no static shell at all. */}
      <Suspense fallback={<Skeleton lines={4} />}>
        <ReportContents params={params} />
      </Suspense>
    </Stack>
  );
}

async function ReportContents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dir } = await resolveDataDir();
  const report = await readReport(dir, id);

  // A report id that never existed, and one that climbed out of the data
  // directory, land here the same way: nothing to show, nothing to say about
  // why. lib/data.ts refuses the second before any file is opened.
  if (!report) notFound();

  return (
    <Stack gap={4}>
      <Stack direction="row" gap={3} align="center" wrap>
        <span className="vd-report-id" title={id}>
          {id}
        </span>
        <Badge tone={report.exitCode === 0 ? 'success' : 'warning'}>
          exit {report.exitCode}
        </Badge>
      </Stack>

      <Stack as="ul" direction="row" gap={4} wrap>
        {BUCKETS.map((bucket) => (
          <li key={bucket} className="vd-scaffold">
            {bucket} <span className="vd-count">{report.counts[bucket]}</span>
          </li>
        ))}
      </Stack>

      {report.warnings.map((warning) => (
        <p key={warning} className="vd-scaffold">
          {warning}
        </p>
      ))}
    </Stack>
  );
}

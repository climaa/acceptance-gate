import NextLink from 'next/link';
import { Suspense } from 'react';
import { EmptyState, Link, Skeleton, Stack } from '@gate/ui';
import { readReports, readSets, resolveDataDir } from '@/lib/data';

/**
 * The console, as far as this issue builds it: proof that the read path works
 * end to end, and the links into the report route. The snapshot-set table, the
 * report table and the run panel are later issues — this page is the frame they
 * land in, not a first draft of them.
 */

export default function ConsolePage() {
  return (
    <Stack gap={6}>
      {/* The data is resolved per request (see lib/data.ts), so it is a dynamic
          hole in an otherwise static shell — which is what this boundary is. */}
      <Suspense fallback={<Skeleton lines={3} />}>
        <ConsoleContents />
      </Suspense>
    </Stack>
  );
}

async function ConsoleContents() {
  const { dir } = await resolveDataDir();
  const [{ sets }, reports] = await Promise.all([readSets(dir), readReports(dir)]);

  return (
    <Stack gap={4}>
      <p className="vd-scaffold">
        <span className="vd-count">{sets.length}</span> capture set(s) ·{' '}
        <span className="vd-count">{reports.length}</span> report(s)
      </p>

      {reports.length === 0 ? (
        <EmptyState message="No reports yet — compare two capture sets and one appears here." />
      ) : (
        <Stack as="ul" gap={2}>
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                as={NextLink}
                href={`/report/${report.id}`}
                className="vd-report-id"
                title={report.id}
              >
                {report.id}
              </Link>{' '}
              <span className="vd-count">{report.counts.changed} changed</span>
            </li>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

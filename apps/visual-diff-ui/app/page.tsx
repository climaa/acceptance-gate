import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { DashboardTemplate } from '@/components/DashboardTemplate';
import { readReports, readSetSizes, readSets, resolveDataDir } from '@/lib/data';
import { readHistory } from '@/lib/jobs';

/**
 * The console: what this instance has captured, compared and run.
 *
 * Everything below the boundary is request-time work — the data directory is
 * resolved per request (see lib/data.ts), so this is a dynamic hole in an
 * otherwise static shell. The run panel and the current-job region are a later
 * issue's; this page is the read surface.
 */

export default function ConsolePage() {
  return (
    <Stack gap={6}>
      <Suspense fallback={<Skeleton lines={6} />}>
        <ConsoleContents />
      </Suspense>
    </Stack>
  );
}

async function ConsoleContents() {
  const { dir } = await resolveDataDir();
  const [{ sets }, sizes, reports] = await Promise.all([
    readSets(dir),
    readSetSizes(dir),
    readReports(dir),
  ]);

  // Read uncached, unlike the three above: history is what a job that finished
  // a second ago just wrote, and `cacheLife('seconds')` would leave a reviewer
  // watching a run that is already over. It is one small JSON file, read
  // synchronously — see lib/jobs.ts, which owns the record and its writers.
  const history = readHistory(dir);

  return (
    <DashboardTemplate sets={sets} sizes={sizes} reports={reports} history={history} />
  );
}

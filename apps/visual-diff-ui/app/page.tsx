import { headers } from 'next/headers';
import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { DashboardTemplate } from '@/components/DashboardTemplate';
import { readReports, readSetSizes, readSets, resolveDataDir } from '@/lib/data';
import { readHistory } from '@/lib/jobs';
import { isLocalHost } from '@/lib/local';

/**
 * The console: what this instance has captured, compared and run.
 *
 * Everything below the boundary is request-time work — the data directory is
 * resolved per request (see lib/data.ts), so this is a dynamic hole in an
 * otherwise static shell. The write half — the run panel, the live log and the
 * confirmations — is client-side inside that hole and polls its own endpoints;
 * nothing on this page is cached beyond the readers below.
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
  const { dir, isSample } = await resolveDataDir();
  // Request-time, like the resolution above it — `headers()` is what makes this
  // subtree dynamic, and `resolveDataDir`'s `connection()` has already done that
  // by the time this runs. Read here rather than in the client bundle so there is
  // no frame in which the start button exists and then vanishes.
  const isLocal = isLocalHost((await headers()).get('host'));
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
    <DashboardTemplate
      sets={sets}
      sizes={sizes}
      reports={reports}
      history={history}
      isSample={isSample}
      isLocal={isLocal}
    />
  );
}

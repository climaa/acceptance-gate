import { headers } from 'next/headers';
import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { DashboardTemplate } from '@/components/DashboardTemplate';
import { readCanonicalSet } from '@/lib/baselines';
import { readReports, readSetSizes, readSets, resolveDataDir } from '@/lib/data';
import { repoRoot } from '@/lib/git';
import { currentJob, readHistory } from '@/lib/jobs';
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
  // The corpus joins the three cached readers rather than being read after
  // them: it is cached now (see lib/baselines.ts for why, and for what its
  // `seconds` window costs), and awaiting it here means its filesystem work
  // overlaps theirs instead of following them.
  //
  // `repoRoot()` is resolved by this caller, not inside the reader, so it joins
  // that reader's cache key — the same rule the `dir` argument follows.
  const [{ sets }, sizes, reports, corpus] = await Promise.all([
    readSets(dir),
    readSetSizes(dir),
    readReports(dir),
    readCanonicalSet(repoRoot()),
  ]);

  // Read uncached, unlike the four above: history is what a job that finished
  // a second ago just wrote, and `cacheLife('seconds')` would leave a reviewer
  // watching a run that is already over. It is one small JSON file, read
  // synchronously — see lib/jobs.ts, which owns the record and its writers.
  const history = readHistory(dir);
  // Which of those rows is alive. Read from the lock rather than from the row,
  // because a running row and one the container went away under are the same
  // row on disk — `currentJob` is the only reader that checks the pid.
  //
  // Read AFTER the history, so the pair can only disagree in the direction that
  // reads harmlessly. A job finishing between the two reads leaves a row that
  // already carries its exit code beside a lock still naming it, and
  // `jobState` resolves that to the verdict; the other order would put a fresh
  // lock beside a history that has never heard of the job.
  const runningId = currentJob(dir)?.id ?? null;

  return (
    <DashboardTemplate
      sets={sets}
      sizes={sizes}
      reports={reports}
      history={history}
      isSample={isSample}
      isLocal={isLocal}
      corpus={corpus}
      runningId={runningId}
    />
  );
}

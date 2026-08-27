import { readReports, resolveDataDir } from '@/lib/data';

/**
 * Every report with a readable summary, newest first.
 *
 * `no-store`, like every other data route on this console. `readReports` is
 * cached with `cacheLife('seconds')` and a tag a delete purges, so a stored copy
 * in front of it would outlive the invalidation it exists to respect.
 */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  const reports = await readReports(dir);

  return Response.json(
    { isSample, reports },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

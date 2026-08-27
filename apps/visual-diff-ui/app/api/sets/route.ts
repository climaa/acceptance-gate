import { readSets, resolveDataDir } from '@/lib/data';

/**
 * The capture sets this instance knows about.
 *
 * `isSample` rides on every payload rather than being inferred by the client:
 * the resolution that produced the directory is the only thing that knows, and
 * it happens here.
 *
 * `no-store`, like every other data route on this console. `readSets` is cached
 * with `cacheLife('seconds')` and a tag a delete purges, so a stored copy in
 * front of it would outlive the invalidation it exists to respect — a set the
 * reviewer just removed would keep coming back.
 */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  const { sets } = await readSets(dir);

  return Response.json({ isSample, sets }, { headers: { 'Cache-Control': 'no-store' } });
}

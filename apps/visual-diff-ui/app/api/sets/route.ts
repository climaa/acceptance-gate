import { readSets, resolveDataDir } from '@/lib/data';

/**
 * The capture sets this instance knows about.
 *
 * `isSample` rides on every payload rather than being inferred by the client:
 * the resolution that produced the directory is the only thing that knows, and
 * it happens here.
 */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  const { sets } = await readSets(dir);

  return Response.json({ isSample, sets });
}

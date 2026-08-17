import { readReports, resolveDataDir } from '@/lib/data';

/** Every report with a readable summary, newest first. */
export async function GET(): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  const reports = await readReports(dir);

  return Response.json({ isSample, reports });
}

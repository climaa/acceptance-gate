import { readReport, resolveDataDir } from '@/lib/data';

interface Context {
  params: Promise<{ id: string }>;
}

/** One report's validated `summary.json`. */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { id } = await params;
  const { dir, isSample } = await resolveDataDir();
  const report = await readReport(dir, id);

  // Unknown and refused answer alike: an id that climbs out of the data
  // directory is not a different kind of miss, and saying so would confirm what
  // is on the disk above it.
  if (!report) return Response.json({ error: 'no such report' }, { status: 404 });

  return Response.json({ isSample, report });
}

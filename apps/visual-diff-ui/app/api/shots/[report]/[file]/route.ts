import * as fs from 'node:fs';
import { resolveDataDir, resolveShotPath } from '@/lib/data';

interface Context {
  params: Promise<{ report: string; file: string }>;
}

const notFound = () => new Response('Not found', { status: 404 });

/**
 * One shot — baseline, candidate or diff — out of a report's `shots/`.
 *
 * Two segments of the URL become a filesystem path, so `resolveShotPath` is the
 * gate: it refuses anything but a PNG name, then re-checks the resolved path
 * against the data directory. A refusal and a miss are both 404 — the reader of
 * the response cannot tell whether they guessed a path that exists.
 *
 * Buffered rather than streamed: policy caps one committed shot at 512 KB, so
 * the whole file is smaller than the machinery to stream it.
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const { report, file } = await params;
  const { dir } = await resolveDataDir();

  const shot = resolveShotPath(dir, report, file);
  if (!shot) return notFound();

  try {
    const bytes = await fs.promises.readFile(shot);

    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.byteLength),
        // A report id names one run's artifacts, and a run never writes twice —
        // so the bytes behind this URL cannot change, only stop existing.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return notFound();
  }
}

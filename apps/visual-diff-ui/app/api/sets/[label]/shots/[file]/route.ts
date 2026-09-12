import * as fs from 'node:fs';
import { resolveDataDir, resolveSetShotPath } from '@/lib/data';
import { repoRoot } from '@/lib/git';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * One screenshot out of a screenshot set — the only way a set's pixels reach a
 * browser.
 *
 * `/api/shots/[report]/[file]` serves a comparison's three shots and cannot
 * answer this: a set is not a report, and the corpus is not even under the data
 * directory. `resolveSetShotPath` is the gate for both, and every refusal it can
 * make — not a PNG name, not a label, a climb out of either directory, a corpus
 * with no checkout — comes back as the same 404 a missing file does. Nothing
 * here confirms what is on the disk.
 *
 * CACHING IS NOT THE REPORT ROUTE'S. That one earns `immutable` from a fact this
 * one does not have: a report id names one run's artifacts and a run never
 * writes twice. A set label names a directory that gets REWRITTEN — `baselines`
 * changes on every accept and on every `git pull`, and a capture label freed by a
 * delete can be recaptured with different pixels behind the same URL. `immutable`
 * suppresses revalidation even on a soft reload, so reviewing the corpus before
 * and after an accept — the reason this page exists — would show yesterday's
 * pixels with no way to tell. `no-cache` means "cache it, but revalidate before
 * use", which is the honest statement: cacheable, and able to change.
 *
 * The ETag is size and mtime, so a revisit costs a `stat` and a 304 rather than
 * re-reading the file. Buffered rather than streamed, as the report route is and
 * for its reason: policy caps one committed shot at 512 KB.
 */
export async function GET(
  request: Request,
  { params }: RouteContext<'/api/sets/[label]/shots/[file]'>,
): Promise<Response> {
  const { label, file } = await params;
  const { dir } = await resolveDataDir();

  const shot = resolveSetShotPath(dir, repoRoot(), label, file);
  if (!shot) return notFound();

  try {
    const stat = await fs.promises.stat(shot);
    const etag = `"${stat.size}-${Math.trunc(stat.mtimeMs)}"`;

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'no-cache' },
      });
    }

    const bytes = await fs.promises.readFile(shot);

    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.byteLength),
        ETag: etag,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return notFound();
  }
}

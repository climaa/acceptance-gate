import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { isMissingReport } from '../proxy';
import { within } from '../lib/paths';

/**
 * The proxy: the only place left that can put `404` on a missing report.
 *
 * The page cannot. `notFound()` renders the right page with the wrong status,
 * because under `cacheComponents` the shell has already gone out by the time
 * the page's own read comes back — measured, and unmoved by `instant = false`
 * on the page and the root layout together.
 *
 * Asserted through `isMissingReport`, which holds every branch: the response it
 * is turned into is one `NextResponse.rewrite` call, and the `next/server` stub
 * here exports `connection()` alone by design — a fake `NextRequest` would hide
 * the moment something began depending on the real one. That the rewrite really
 * carries a 404 was measured against a production build, and CI re-measures it.
 */

const temporaryDirs: string[] = [];

afterEach(() => {
  delete process.env.VISUAL_DIFF_DATA_DIR;
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A configured data directory holding exactly the reports named. */
function dataDirWith(...reports: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-'));
  temporaryDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'reports'), { recursive: true });

  for (const id of reports) {
    const file = within(dir, 'reports', id, 'summary.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{}');
  }

  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

const ask = (pathname: string) => isMissingReport(pathname);

const REPORT = 'main-2026-08-17__main-2026-08-13';

describe('the report proxy', () => {
  it('lets a report that exists through untouched', () => {
    dataDirWith(REPORT);

    const answer = ask(`/report/${REPORT}`);

    // Untouched is what keeps the route's static shell: the page answers this
    // request exactly as it did before this file existed.
    expect(answer).toBe(false);
  });

  it('answers a report that does not exist with a 404', () => {
    dataDirWith(REPORT);

    const answer = ask('/report/never-ran__never-ran');

    expect(answer).toBe(true);
  });

  // The deleted report, which is the arrival this whole file exists for: the id
  // is well-formed and was real, and the tree it names is gone.
  it('answers a report deleted since the link was drawn with a 404', () => {
    const dir = dataDirWith(REPORT);
    fs.rmSync(path.join(dir, 'reports', REPORT), { recursive: true });

    const answer = ask(`/report/${REPORT}`);

    expect(answer).toBe(true);
  });

  // `hasReport` refuses a climb by throwing, and a throw here is a 500 on the
  // one path whose entire job is to produce a 404.
  it('answers an id that climbs out of the data directory without throwing', () => {
    dataDirWith(REPORT);

    const answer = ask('/report/..%2F..%2Fetc%2Fpasswd');

    expect(answer).toBe(true);
  });

  /**
   * The instance with nothing to say.
   *
   * A proxy is bundled as its own function, so "no such report" and "this
   * function shipped without the tree to look in" arrive here as the same
   * `false`. Answering the second with a 404 would take every report on a
   * deployment down at once, so an unreadable tree means the route answers as
   * it always did.
   */
  it('stays out of the way when there is no reports tree to read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-'));
    temporaryDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'sets.json'), '{"sets":[]}');
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const answer = ask('/report/never-ran__never-ran');

    expect(answer).toBe(false);
  });
});

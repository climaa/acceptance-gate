import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { comparisonAnswer, isMissingReport, isMissingSet, reportAnswer } from '../proxy';
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

/** A configured data directory holding exactly the capture sets named. */
function setsDirWith(...labels: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-set-'));
  temporaryDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'sets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'sets.json'), '{"sets":[]}');

  for (const label of labels) {
    fs.mkdirSync(within(dir, 'sets', label), { recursive: true });
  }

  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

describe('the set proxy', () => {
  it('lets a set this instance holds through untouched', () => {
    setsDirWith('main-2026-08-17');

    const answer = isMissingSet('/set/main-2026-08-17');

    expect(answer).toBe(false);
  });

  it('answers a set this instance never captured with a 404', () => {
    setsDirWith('main-2026-08-17');

    const answer = isMissingSet('/set/never-captured');

    expect(answer).toBe(true);
  });

  /**
   * The one branch that needs no tree at all. "Not a label" is a fact about the
   * string, so this answers even where the report half would have to stay quiet
   * — and it is what keeps a climbing segment from reaching the route.
   */
  it('refuses a segment that is not a label, with no data directory to read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-set-'));
    temporaryDirs.push(dir);
    fs.writeFileSync(path.join(dir, 'sets.json'), '{"sets":[]}');
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const answer = isMissingSet('/set/..%2F..%2Fetc');

    expect(answer).toBe(true);
  });

  /**
   * The corpus lives in the checkout, not the data directory, and a proxy is
   * bundled as its own function — so "no corpus" and "shipped without the
   * checkout" are one answer here. It says nothing, and the page tells the two
   * apart with an empty state at 200.
   */
  it('never calls the corpus a miss', () => {
    setsDirWith();

    const answer = isMissingSet('/set/baselines');

    expect(answer).toBe(false);
  });

  it('stays out of the way when there is no sets tree to read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-set-'));
    temporaryDirs.push(dir);
    // Populated, or `dataDirFrom` calls it "no data here" and resolves to the
    // committed fixtures instead — which have a `sets/` tree, so the assertion
    // below would be about the wrong directory entirely.
    fs.writeFileSync(path.join(dir, 'sets.json'), '{"sets":[]}');
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const answer = isMissingSet('/set/never-captured');

    expect(answer).toBe(false);
  });
});

/**
 * A segment that will not decode at all.
 *
 * `decodeURIComponent('%')` throws `URIError`, and both checks decoded before
 * anything caught it — so `/report/%` and `/set/%` answered 500, on the one path
 * that exists to answer 404. Measured against a running server, both routes,
 * before the guard went in.
 */
describe('a segment that is not even a string', () => {
  it.each([
    ['a bare percent', '%'],
    ['a truncated escape', '%E0%A4%A'],
  ])('answers a set with %s as a miss rather than throwing', (_case, segment) => {
    setsDirWith('main-2026-08-17');

    const answer = isMissingSet(`/set/${segment}`);

    expect(answer).toBe(true);
  });

  it('answers a report with a malformed escape as a miss rather than throwing', () => {
    dataDirWith(REPORT);

    const answer = isMissingReport('/report/%');

    expect(answer).toBe(true);
  });
});

/** A variant row with only the fields the lookup reads set to anything telling. */
const variant = (key: string, bucket: string) => {
  const [tier, viewport, theme, id] = key.split('__');

  return {
    key,
    id,
    tier,
    viewport,
    theme,
    bucket,
    overlapDiffPixels: 0,
    marginPixels: 0,
    diffPixels: 0,
    allowedDiffPixels: 0,
    width: null,
    height: null,
    sizeDelta: null,
    violations: [],
    error: null,
  };
};

const CHANGED = 'atoms__desktop__light__atoms-prose--default';
const A11Y = 'atoms__desktop__dark__atoms-badge--default';

/** A configured data directory holding one report with a real summary. */
function reportWithVariants(): void {
  const dir = dataDirWith();
  const file = within(dir, 'reports', REPORT, 'summary.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      exitCode: 1,
      thresholds: { maxDiffPixels: 0, maxDiffRatio: 0 },
      env: {},
      // Every bucket, because the schema's record is keyed by the whole enum.
      counts: { unchanged: 0, changed: 1, added: 0, removed: 0, errored: 0, a11y: 1 },
      warnings: [],
      variants: [variant(CHANGED, 'changed'), variant(A11Y, 'a11y')],
    }),
  );
}

const compareAt = (id: string, param: string) =>
  `/report/${encodeURIComponent(id)}/compare/${encodeURIComponent(param)}`;

describe('the comparison proxy', () => {
  it('lets a comparison the report holds through untouched', () => {
    reportWithVariants();

    const answer = comparisonAnswer(compareAt(REPORT, CHANGED));

    expect(answer).toEqual({ kind: 'pass' });
  });

  it('answers a key the report does not hold with a 404', () => {
    reportWithVariants();

    const answer = comparisonAnswer(compareAt(REPORT, 'atoms__desktop__light__nope'));

    expect(answer).toEqual({ kind: 'missing' });
  });

  it('answers a comparison in a report that does not exist with a 404', () => {
    reportWithVariants();

    const answer = comparisonAnswer(compareAt('nothing__here', CHANGED));

    expect(answer).toEqual({ kind: 'missing' });
  });

  // The modal never frames an a11y variant, so its address cannot open one —
  // and a 404 is what keeps that from being a blank dialog instead.
  it('answers an accessibility variant with a 404', () => {
    reportWithVariants();

    const answer = comparisonAnswer(compareAt(REPORT, A11Y));

    expect(answer).toEqual({ kind: 'missing' });
  });

  it('redirects a bare story id onto its key, keeping the query', () => {
    reportWithVariants();

    const answer = comparisonAnswer(
      compareAt(REPORT, 'atoms-prose--default'),
      '?mode=slider',
    );

    expect(answer).toEqual({
      kind: 'redirect',
      to: `${compareAt(REPORT, CHANGED)}?mode=slider`,
    });
  });

  it('answers a malformed escape as a miss rather than throwing', () => {
    reportWithVariants();

    const answer = comparisonAnswer(`/report/${REPORT}/compare/%`);

    expect(answer).toEqual({ kind: 'missing' });
  });

  it('answers a report whose summary will not parse with a 404', () => {
    dataDirWith(REPORT);

    const answer = comparisonAnswer(compareAt(REPORT, CHANGED));

    expect(answer).toEqual({ kind: 'missing' });
  });

  it('stays out of the way when there is no reports tree to read', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-proxy-'));
    temporaryDirs.push(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const answer = comparisonAnswer(compareAt(REPORT, CHANGED));

    expect(answer).toEqual({ kind: 'pass' });
  });
});

describe('a link written before comparisons had paths', () => {
  it('redirects ?story and ?mode onto the comparison path', () => {
    reportWithVariants();

    const answer = reportAnswer(`/report/${REPORT}`, `?story=${CHANGED}&mode=slider`);

    expect(answer).toEqual({
      kind: 'redirect',
      to: `${compareAt(REPORT, CHANGED)}?mode=slider`,
    });
  });

  it('drops a mode that is not one', () => {
    reportWithVariants();

    const answer = reportAnswer(`/report/${REPORT}`, `?story=${CHANGED}&mode=sideways`);

    expect(answer).toEqual({ kind: 'redirect', to: compareAt(REPORT, CHANGED) });
  });

  it('leaves a report link with no story alone', () => {
    reportWithVariants();

    const answer = reportAnswer(`/report/${REPORT}`, '?bucket=changed');

    expect(answer).toEqual({ kind: 'pass' });
  });

  it('still answers a missing report with a 404 before reading the query', () => {
    reportWithVariants();

    const answer = reportAnswer('/report/nothing__here', `?story=${CHANGED}`);

    expect(answer).toEqual({ kind: 'missing' });
  });
});

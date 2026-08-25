import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, describe, expect, it } from 'vitest';
import {
  FIXTURES_DIR,
  readReport,
  readReports,
  readSetSizes,
  readSets,
  resolveDataDir,
  resolveShotPath,
} from '../lib/data';

/**
 * The read path and the fallback that makes sample mode: which directory the
 * app reads, what it does with a tree that is missing, empty or half-written,
 * and the resolve-and-prefix check every path goes through before it is opened.
 */

const FIXTURE_REPORT = 'main-2026-08-17__main-2026-08-13';
/** The second sample: the IconButton stories entering the corpus, so the demo
 *  shows an `added` verdict and not only a `changed` one. */
const ADDED_REPORT = 'baselines__main-2026-08-24';
const FIXTURE_SHOT = 'atoms__desktop__light__atoms-prose--default.diff.png';

const temporaryDirs: string[] = [];

/** A data directory of this app's own layout, populated with `files`. */
function makeDataDir(files: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-data-'));
  temporaryDirs.push(dir);

  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }

  return dir;
}

const setsFile = (label: string) => ({
  sets: [{ label, sha: 'abc1234', branch: 'main', capturedAt: '2026-08-17', stories: 3 }],
});

const summaryFile = (exitCode: number) => ({
  schemaVersion: 1,
  exitCode,
  thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
  env: { platform: 'linux' },
  counts: { unchanged: 1, changed: 0, added: 0, removed: 0, errored: 0, a11y: 0 },
  warnings: [],
  variants: [],
});

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveDataDir', () => {
  it('falls back to the committed fixtures when nothing is configured', async () => {
    const source = await resolveDataDir({});

    expect(source).toEqual({ dir: FIXTURES_DIR, isSample: true });
  });

  it('falls back when the variable is set to an empty string', async () => {
    const source = await resolveDataDir({ VISUAL_DIFF_DATA_DIR: '' });

    expect(source).toEqual({ dir: FIXTURES_DIR, isSample: true });
  });

  it('falls back when the configured directory does not exist', async () => {
    const missing = path.join(makeDataDir(), 'nothing-here');

    const source = await resolveDataDir({ VISUAL_DIFF_DATA_DIR: missing });

    expect(source).toEqual({ dir: FIXTURES_DIR, isSample: true });
  });

  // An instance whose CLI has not produced anything yet is indistinguishable
  // from one with no CLI behind it: both show the sample console rather than an
  // empty one.
  it('falls back when the configured directory is empty', async () => {
    const empty = makeDataDir();

    const source = await resolveDataDir({ VISUAL_DIFF_DATA_DIR: empty });

    expect(source).toEqual({ dir: FIXTURES_DIR, isSample: true });
  });

  it('reads a populated tree and stops calling it sample data', async () => {
    const populated = makeDataDir({ 'sets.json': setsFile('main-2026-08-17') });

    const source = await resolveDataDir({ VISUAL_DIFF_DATA_DIR: populated });

    expect(source).toEqual({ dir: populated, isSample: false });
  });

  it('defaults to the process environment', async () => {
    const source = await resolveDataDir();

    expect(source.dir).toBe(FIXTURES_DIR);
  });
});

describe('readSets', () => {
  it('parses the committed fixture', async () => {
    const { sets } = await readSets(FIXTURES_DIR);

    expect(sets.map((set) => set.label)).toEqual([
      'main-2026-08-24',
      'main-2026-08-17',
      'main-2026-08-13',
    ]);
  });

  // The cache-key property: `use cache` keys on serialized arguments, so a
  // reader that resolved the directory internally would answer with the same
  // fixtures for every caller — and a deployed instance would serve sample data
  // forever. Two directories, two answers.
  it('answers from the directory it is given, not from a resolved default', async () => {
    const seeded = makeDataDir({ 'sets.json': setsFile('seeded-set') });

    const [fixtures, other] = await Promise.all([
      readSets(FIXTURES_DIR),
      readSets(seeded),
    ]);

    expect(other.sets.map((set) => set.label)).toEqual(['seeded-set']);
    expect(fixtures.sets).not.toEqual(other.sets);
  });

  it('reads an empty list from a tree that has captured nothing', async () => {
    const populated = makeDataDir({ 'reports/r1/summary.json': summaryFile(0) });

    const { sets } = await readSets(populated);

    expect(sets).toEqual([]);
  });

  it('names the file it could not parse', async () => {
    const broken = makeDataDir({ 'sets.json': '{ "sets": [' });

    await expect(readSets(broken)).rejects.toThrow(/sets\.json/);
  });

  it('rejects a sets file that does not match the schema', async () => {
    const drifted = makeDataDir({ 'sets.json': { sets: [{ label: 'no sha' }] } });

    await expect(readSets(drifted)).rejects.toThrow(/sets\.json/);
  });
});

describe('readReports', () => {
  it('lists the committed fixture report with its counts', async () => {
    const reports = await readReports(FIXTURES_DIR);

    // Newest-first is a descending sort on the id, so `main-…` leads and the
    // `baselines__…` report follows — not capture order.
    expect(reports).toEqual([
      {
        id: FIXTURE_REPORT,
        exitCode: 1,
        counts: { unchanged: 100, changed: 6, added: 0, removed: 0, errored: 0, a11y: 0 },
      },
      {
        id: ADDED_REPORT,
        exitCode: 1,
        counts: {
          unchanged: 144,
          changed: 0,
          added: 10,
          removed: 0,
          errored: 0,
          a11y: 0,
        },
      },
    ]);
  });

  it('answers from the directory it is given', async () => {
    const seeded = makeDataDir({ 'reports/run-1/summary.json': summaryFile(0) });

    const reports = await readReports(seeded);

    expect(reports.map((report) => report.id)).toEqual(['run-1']);
  });

  it('reads an empty list from a tree with no reports directory', async () => {
    const populated = makeDataDir({ 'sets.json': setsFile('main') });

    const reports = await readReports(populated);

    expect(reports).toEqual([]);
  });

  // A run mid-write has a directory and shots before it has a summary. It is
  // not a report yet, and it must not take the whole list down with it.
  it('skips a directory whose summary is missing or unreadable', async () => {
    const seeded = makeDataDir({
      'reports/done/summary.json': summaryFile(0),
      'reports/writing/shots/a.png': 'not a png',
      'reports/broken/summary.json': '{',
    });

    const reports = await readReports(seeded);

    expect(reports.map((report) => report.id)).toEqual(['done']);
  });

  it('sorts newest-named report first', async () => {
    const seeded = makeDataDir({
      'reports/main-2026-08-11__x/summary.json': summaryFile(0),
      'reports/main-2026-08-17__x/summary.json': summaryFile(1),
      'reports/main-2026-08-13__x/summary.json': summaryFile(0),
    });

    const reports = await readReports(seeded);

    expect(reports.map((report) => report.id)).toEqual([
      'main-2026-08-17__x',
      'main-2026-08-13__x',
      'main-2026-08-11__x',
    ]);
  });
});

describe('readReport', () => {
  it('parses the committed fixture summary', async () => {
    const report = await readReport(FIXTURES_DIR, FIXTURE_REPORT);

    expect(report?.variants).toHaveLength(6);
  });

  it('answers null for a report id nothing captured', async () => {
    const report = await readReport(FIXTURES_DIR, 'never-ran');

    expect(report).toBeNull();
  });

  it('answers null for an id that climbs out of the data directory', async () => {
    const report = await readReport(FIXTURES_DIR, '../../../etc');

    expect(report).toBeNull();
  });

  // Refused for its shape, before any path is built: a NUL reaches `readFile`
  // as a read error rather than a miss, which would answer 500 to a request
  // that is only ever a 404.
  it('answers null for an id no directory could be named', async () => {
    const report = await readReport(FIXTURES_DIR, `${FIXTURE_REPORT}\0.png`);

    expect(report).toBeNull();
  });

  it('answers from the directory it is given', async () => {
    const seeded = makeDataDir({ 'reports/run-1/summary.json': summaryFile(2) });

    const [seededReport, fixtureReport] = await Promise.all([
      readReport(seeded, 'run-1'),
      readReport(seeded, FIXTURE_REPORT),
    ]);

    expect(seededReport?.exitCode).toBe(2);
    expect(fixtureReport).toBeNull();
  });
});

describe('readSetSizes', () => {
  it('measures every capture set on disk, by label', async () => {
    const seeded = makeDataDir({
      'sets/main-2026-08-17/atoms__desktop__light__a--b.png': '1234567890',
      'sets/main-2026-08-17/atoms__desktop__dark__a--b.png': '12345',
      'sets/main-2026-08-13/atoms__desktop__light__a--b.png': '1',
    });

    const sizes = await readSetSizes(seeded);

    expect(sizes).toEqual({ 'main-2026-08-17': 15, 'main-2026-08-13': 1 });
  });

  // The registry and the shot trees are two facts, and a console that has one
  // without the other still has to render: the table says "unknown", not "0".
  it('has no entry for a registered set whose shots are not here', async () => {
    const seeded = makeDataDir({ 'sets.json': setsFile('main-2026-08-17') });

    const sizes = await readSetSizes(seeded);

    expect(sizes).toEqual({});
  });

  it('reads nothing from a tree that has captured nothing', async () => {
    const sizes = await readSetSizes(makeDataDir());

    expect(sizes).toEqual({});
  });

  // `sets/` holds one flat directory of PNGs per set — a file dropped beside
  // them is not a set, and counting it would invent one.
  it('ignores a file sitting where a set directory would be', async () => {
    const seeded = makeDataDir({
      'sets/notes.txt': 'not a capture set',
      'sets/main-2026-08-17/a.png': '123',
    });

    const sizes = await readSetSizes(seeded);

    expect(sizes).toEqual({ 'main-2026-08-17': 3 });
  });
});

describe('resolveShotPath', () => {
  it('resolves a shot inside the report it belongs to', () => {
    const resolved = resolveShotPath(FIXTURES_DIR, FIXTURE_REPORT, FIXTURE_SHOT);

    expect(resolved).toBe(
      path.join(FIXTURES_DIR, 'reports', FIXTURE_REPORT, 'shots', FIXTURE_SHOT),
    );
  });

  it.each([
    ['a relative climb', FIXTURE_REPORT, '../../../../sets.json'],
    ['a nested climb', FIXTURE_REPORT, 'shots/../../summary.json'],
    ['an absolute path', FIXTURE_REPORT, '/etc/passwd'],
    ['a climbing report id', '..', FIXTURE_SHOT],
    ['a non-image file', FIXTURE_REPORT, 'summary.json'],
    ['an empty file name', FIXTURE_REPORT, ''],
    ['a NUL in the file name', FIXTURE_REPORT, `a\0.png`],
    ['a NUL in the report id', `${FIXTURE_REPORT}\0`, FIXTURE_SHOT],
  ])('refuses %s', (_case, report, file) => {
    const resolved = resolveShotPath(FIXTURES_DIR, report, file);

    expect(resolved).toBeNull();
  });

  // The check is on the resolved path, not on the string: a name that merely
  // starts with the directory's own prefix is still outside it.
  it('refuses a sibling directory sharing the data directory prefix', () => {
    const resolved = resolveShotPath('/data/reports', '../reports-evil', 'a.png');

    expect(resolved).toBeNull();
  });
});

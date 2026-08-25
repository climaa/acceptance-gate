import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  ConfinementError,
  REPORT_ID,
  SET_LABEL,
  entryUnder,
  reportDir,
  reportDirOf,
  reportsRoot,
  setDir,
  setsFilePath,
  setsRoot,
  shotUnder,
  summaryFile,
  within,
} from '../lib/paths';

/**
 * The containment check, from both sides, and the layout it builds.
 *
 * This suite exists because the rule was written twice and proved once. The
 * climbing case — `..` out of the data directory — was covered from four
 * directions (`data.test.ts`, `api.test.ts`, `jobs.test.ts` twice), and the two
 * harder halves of the same sentence were covered from none: replacing the whole
 * check with a bare `startsWith(base)` left all 653 tests green, and so did
 * letting a URL segment resolve to the root itself. Both doc comments claimed the
 * sibling case outright — "a sibling sharing the root's prefix are all refused" —
 * and both were telling the truth about code nothing was holding to it.
 *
 * `<base>-old` is the case worth stating plainly. It shares every character of
 * `<base>`, so a prefix test calls it a child; only the separator tells them
 * apart. On this app that is the difference between a delete confined to
 * `.visual-diff` and one that reaches `.visual-diff-backup` beside it.
 *
 * Tested against the primitive rather than through a route, for the reason the
 * module exists: there is one implementation now, and asserting it once on each
 * side would be the shape this refactor retired.
 */

const BASE = path.resolve('/tmp/vd-data');

describe('within — the write side', () => {
  it('builds a path under the directory', () => {
    expect(within(BASE, 'reports', 'a__b')).toBe(path.join(BASE, 'reports', 'a__b'));
  });

  it('allows the directory itself, which is where the builders start', () => {
    expect(within(BASE)).toBe(BASE);
  });

  it('refuses a climb out of the directory', () => {
    expect(() => within(BASE, '..', 'etc')).toThrow(ConfinementError);
  });

  it('refuses an absolute segment, which replaces the base rather than joining it', () => {
    expect(() => within(BASE, '/etc/passwd')).toThrow(ConfinementError);
  });

  // The case a prefix test gets wrong. `<base>-old` starts with `<base>` and is
  // not under it; only the separator distinguishes them.
  it('refuses a sibling that merely shares the directory name as a prefix', () => {
    expect(() => within(BASE, '..', `${path.basename(BASE)}-old`)).toThrow(
      ConfinementError,
    );
  });

  it('names the path and the directory it fell outside of', () => {
    expect(() => within(BASE, '..', 'elsewhere')).toThrow(
      /is outside the data directory/,
    );
  });

  it('refuses a climb hidden in the middle of a run of segments', () => {
    expect(() => within(BASE, 'sets', '..', '..', 'escaped')).toThrow(ConfinementError);
  });
});

describe('entryUnder — the read side', () => {
  it('names one entry under the root', () => {
    expect(entryUnder(BASE, 'a__b')).toBe(path.join(BASE, 'a__b'));
  });

  it('answers null rather than throwing, because a miss is a 404', () => {
    expect(entryUnder(BASE, '../escaped')).toBeNull();
  });

  it('refuses an absolute segment', () => {
    expect(entryUnder(BASE, '/etc/passwd')).toBeNull();
  });

  it('refuses a sibling sharing the root as a prefix', () => {
    expect(entryUnder(BASE, `../${path.basename(BASE)}-old`)).toBeNull();
  });

  // The one deliberate difference from `within`, which allows the base.
  it('refuses a segment that resolves to the root, which names no entry in it', () => {
    expect(entryUnder(BASE, '')).toBeNull();
    expect(entryUnder(BASE, '.')).toBeNull();
  });
});

describe('the shapes', () => {
  it('accepts the ids and labels the console writes', () => {
    expect(REPORT_ID.test('main-2026-08-17__main-2026-08-13')).toBe(true);
    expect(SET_LABEL.test('main-2026-08-17')).toBe(true);
  });

  // A set label splits `<a>__<b>` back apart, so it may not carry the separator.
  it('keeps an underscore out of a set label, which a report id needs', () => {
    expect(SET_LABEL.test('main__2026')).toBe(false);
    expect(REPORT_ID.test('main__2026')).toBe(true);
  });

  it('refuses a leading dot, a separator and a NUL', () => {
    for (const bad of ['.hidden', 'a/b', 'a\0b', '..', '']) {
      expect(REPORT_ID.test(bad)).toBe(false);
      expect(SET_LABEL.test(bad)).toBe(false);
    }
  });
});

describe('the layout', () => {
  it('builds every path the data directory holds', () => {
    expect(setsFilePath(BASE)).toBe(path.join(BASE, 'sets.json'));
    expect(setsRoot(BASE)).toBe(path.join(BASE, 'sets'));
    expect(setDir(BASE, 'main-2026-08-17')).toBe(
      path.join(BASE, 'sets', 'main-2026-08-17'),
    );
    expect(reportsRoot(BASE)).toBe(path.join(BASE, 'reports'));
    expect(reportDir(BASE, 'a__b')).toBe(path.join(BASE, 'reports', 'a__b'));
    expect(summaryFile(reportDir(BASE, 'a__b'))).toBe(
      path.join(BASE, 'reports', 'a__b', 'summary.json'),
    );
  });

  it('resolves a report a reader asked for by id', () => {
    expect(reportDirOf(BASE, 'a__b')).toBe(path.join(BASE, 'reports', 'a__b'));
  });

  // Shape and confinement answer alike, so a caller cannot tell an id that never
  // existed from one that tried to climb.
  it('answers null for an id of the wrong shape and for one that climbs', () => {
    expect(reportDirOf(BASE, '../../etc')).toBeNull();
    expect(reportDirOf(BASE, 'a\0b')).toBeNull();
    expect(reportDirOf(BASE, '.hidden')).toBeNull();
  });

  it('confines a shot filename that arrived in a URL', () => {
    const dir = reportDir(BASE, 'a__b');

    expect(shotUnder(dir, 'k.diff.png')).toBe(path.join(dir, 'shots', 'k.diff.png'));
    expect(shotUnder(dir, '../../../etc/passwd')).toBeNull();
    expect(shotUnder(dir, '/etc/passwd')).toBeNull();
  });
});

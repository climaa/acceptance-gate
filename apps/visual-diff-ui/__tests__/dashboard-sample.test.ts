import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_REPORTS,
  SAMPLE_SETS,
  SAMPLE_SIZES,
} from '../app/_screens/dashboard-sample';
import { newestFirst } from '../lib/report-order';

/**
 * The dashboard screen story copies what a sample instance reads off
 * `fixtures/`, because a story cannot list a directory. These cases hold the
 * copy to the directory, so a fixture edit fails here rather than leaving the
 * screen's baseline quietly different from the page it stands for.
 */

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

/** The subdirectories of `dir`, as `lib/data.ts` lists sets and reports. */
const dirsIn = (dir: string) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

/** The bytes one flat set directory holds, as `readSetSizes` measures them. */
const bytesIn = (dir: string) =>
  fs
    .readdirSync(dir)
    .reduce((total, name) => total + fs.statSync(path.join(dir, name)).size, 0);

describe('the dashboard screen’s sample data', () => {
  it('lists every report under fixtures/reports, newest id first', () => {
    const reportsDir = path.join(FIXTURES, 'reports');
    const onDisk = dirsIn(reportsDir)
      .filter((id) => fs.existsSync(path.join(reportsDir, id, 'summary.json')))
      .sort(newestFirst);

    const ids = SAMPLE_REPORTS.map((report) => report.id);

    expect(ids).toEqual(onDisk);
  });

  it('measures every set directory under fixtures/sets to the byte', () => {
    const setsDir = path.join(FIXTURES, 'sets');
    const onDisk = Object.fromEntries(
      dirsIn(setsDir).map((label) => [label, bytesIn(path.join(setsDir, label))]),
    );

    const sizes = SAMPLE_SIZES;

    expect(sizes).toEqual(onDisk);
  });

  it('reads the sets registry the sample instance serves', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(FIXTURES, 'sets.json'), 'utf8'),
    ) as { sets: unknown[] };

    const sets = SAMPLE_SETS;

    expect(sets).toEqual(registry.sets);
  });
});

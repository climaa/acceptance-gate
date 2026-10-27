import type { ReportListEntry } from '@/lib/data';
import { newestFirst } from '@/lib/report-order';
import sets from '../../fixtures/sets.json';
import baselinesVsAug24 from '../../fixtures/reports/baselines__main-2026-08-24/summary.json';
import aug17VsAug13 from '../../fixtures/reports/main-2026-08-17__main-2026-08-13/summary.json';
import sep17VsOct13 from '../../fixtures/reports/main-2026-09-17__main-2026-10-13/summary.json';
import oct13VsSep17 from '../../fixtures/reports/main-2026-10-13__main-2026-09-17/summary.json';

/**
 * What a sample instance reads off `fixtures/` for `/`, as literal imports: a
 * story runs in the browser and cannot list a directory or stat a file.
 *
 * Written down rather than read, so `__tests__/dashboard-sample.test.ts` holds
 * it to the directory it copies: a report added to `fixtures/reports/`, or a
 * set directory that grows, fails there instead of leaving this screen's
 * baseline quietly different from the page it stands for.
 */

/** The sets registry, as `readSets` parses it. */
export const SAMPLE_SETS = sets.sets;

/** Each report id with its summary, by directory name. */
const SUMMARIES = {
  'baselines__main-2026-08-24': baselinesVsAug24,
  'main-2026-08-17__main-2026-08-13': aug17VsAug13,
  'main-2026-09-17__main-2026-10-13': sep17VsOct13,
  'main-2026-10-13__main-2026-09-17': oct13VsSep17,
};

/** The reports list, in the order `readReports` (lib/data.ts) returns it. */
export const SAMPLE_REPORTS: ReportListEntry[] = Object.entries(SUMMARIES)
  .map(([id, summary]) => ({ id, exitCode: summary.exitCode, counts: summary.counts }))
  .sort((left, right) => newestFirst(left.id, right.id));

/** Bytes on disk per set directory under `fixtures/sets/`, as `readSetSizes`
 *  measures them. */
export const SAMPLE_SIZES: Readonly<Record<string, number>> = {
  'main-2026-08-30': 216_626,
};

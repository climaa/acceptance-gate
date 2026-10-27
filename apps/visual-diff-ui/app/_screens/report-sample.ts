import type { LedgerReport } from '@gate/visual-diff/ledger';
import { comparableVariants, comparisonPath, reportPath } from '@/lib/comparison';
import { SummarySchema } from '@/lib/summary';
import ledger from '../../fixtures/reports/main-2026-10-13__main-2026-09-17/ledger/organisms__desktop__light__organisms-dialog--open.json';
import summary from '../../fixtures/reports/main-2026-10-13__main-2026-09-17/summary.json';

/**
 * What a sample instance reads off `fixtures/` for one report and one of its
 * comparisons, as literal imports — see `dashboard-sample.ts` for why, and
 * `__tests__/screen-samples.test.ts` for what holds it to the readers.
 *
 * The report that changed and lost variants both, with readings on the dialog it
 * changed, so the screen draws two buckets and the comparison has a ledger.
 */

export const SAMPLE_REPORT_ID = 'main-2026-10-13__main-2026-09-17';

/** Parsed as `readReport` parses it: the schema fills nothing in, but the enums
 *  it narrows are what the template's types ask for. */
export const SAMPLE_REPORT = SummarySchema.parse(summary);

/** A changed variant with a ledger report beside it. */
export const SAMPLE_COMPARISON_KEY = 'organisms__desktop__light__organisms-dialog--open';

/** The variants the modal walks, as `readComparison` lists them. */
export const SAMPLE_VARIANTS = comparableVariants(SAMPLE_REPORT.variants);

/** As the file holds it; `readLedgerReport` validates and changes nothing.
 *  The JSON import widens the enums, so the type is asserted, and the test is
 *  what checks it. */
export const SAMPLE_LEDGER = ledger as unknown as LedgerReport;

export const SAMPLE_REPORT_PATH = reportPath(SAMPLE_REPORT_ID);
export const SAMPLE_COMPARISON_PATH = comparisonPath(
  SAMPLE_REPORT_ID,
  SAMPLE_COMPARISON_KEY,
);

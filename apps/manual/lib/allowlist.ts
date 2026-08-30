/** The URL segment for each published page, and the key everything joins on. */
export type ManualSlug = 'console' | 'report' | 'sample';

export interface ManualPage {
  slug: ManualSlug;
  /**
   * Repo-root-relative, resolved in `lib/features.ts`. Written from the root
   * rather than as `../e2e/...` so the path reads the same here as it does in a
   * `git grep`, and so moving this file does not silently move the source.
   */
  featurePath: string;
  /** The page's own title. Free to differ from the `Feature:` line it renders. */
  title: string;
  /**
   * Pinned, and asserted by exact equality in `__tests__/sync.test.ts`.
   *
   * This is the one number a human maintains, and it is what makes the manual
   * fail rather than drift. Page content cannot go stale on its own — the pages
   * are parsed from the live `.feature` files at build time, so changing a step
   * changes the page in the same commit. What that gives away for free is also
   * what it hides: a scenario added or deleted flows straight through to the
   * published page with nobody deciding whether the surrounding prose still
   * makes sense. The pin turns that into a red build, which is the editorial
   * coupling this manual accepted on purpose.
   *
   * `apps/e2e/scripts/suite-integrity.mjs` pins the suite's total the same way
   * and for the same reason. It is deliberately not extended to cover these:
   * which features get published is a documentation concern and has no business
   * in the suite's guard.
   */
  expectedScenarios: number;
}

/**
 * The published features, in page order. Array order is page order — a separate
 * ordering field would be a second thing to keep in step with this one.
 *
 * Per-file rather than a `@manual` tag inside the features themselves: which
 * scenarios get published is documentation's business, and tagging would put it
 * inside files that are product requirements and stop-and-ask to edit.
 *
 * `visual-diff-a11y.feature` is deliberately absent. It is a quality gate rather
 * than something a reader does, which is also what keeps this list per-file
 * instead of per-scenario.
 */
export const MANUAL_PAGES: readonly ManualPage[] = [
  {
    slug: 'console',
    featurePath: 'apps/e2e/features/acceptance/visual-diff-console.feature',
    title: 'Visual-diff console',
    expectedScenarios: 7,
  },
  {
    slug: 'report',
    featurePath: 'apps/e2e/features/acceptance/visual-diff-report.feature',
    title: 'Visual-diff report',
    expectedScenarios: 15,
  },
  {
    slug: 'sample',
    featurePath: 'apps/e2e/features/acceptance/visual-diff-sample.feature',
    title: 'Sample mode',
    expectedScenarios: 4,
  },
];

export function findManualPage(slug: string): ManualPage | undefined {
  return MANUAL_PAGES.find((page) => page.slug === slug);
}

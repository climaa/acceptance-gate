// The published `.feature` files, read as text — what `apps/manual/lib/sources.ts`
// exports, for a story rendering in a browser.
//
// The manual reads each file with `readFileSync` at import, which a browser cannot
// do, so `main.ts` resolves the manual's `@/lib/sources` to this file instead, the
// way it resolves the console's `@/lib/design-urls`. The same three files, by the
// same keys: `apps/storybook/__tests__/manual-sources.test.ts` holds the two lists
// to each other, so a page added to the manual cannot render here with no text.
import consoleFeature from '../../e2e/features/acceptance/visual-diff-console.feature?raw';
import reportFeature from '../../e2e/features/acceptance/visual-diff-report.feature?raw';
import sampleFeature from '../../e2e/features/acceptance/visual-diff-sample.feature?raw';

export const FEATURE_SOURCES: Readonly<Record<'console' | 'report' | 'sample', string>> =
  {
    console: consoleFeature,
    report: reportFeature,
    sample: sampleFeature,
  };

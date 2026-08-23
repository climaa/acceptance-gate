import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// Reused steps and their homes — one definition per Gherkin line:
//   "I visit the console"                      → visual-diff-console.steps.ts
//   "a finished comparison report exists"      → visual-diff-report.steps.ts
//   "I open the report"                        → visual-diff-report.steps.ts
//   "the comparison modal is open"             → visual-diff-report.steps.ts
//   "I switch to the dark theme"               → a11y.steps.ts (blog suite)
//   "the page has no accessibility violations" → a11y.steps.ts (blog suite)

const A11Y_STORY = 'Badge — Tones';

When('I mark the a11y story as reviewed', async ({ report }) => {
  await report.markReviewed(A11Y_STORY);
});

Then('the accessibility section appears before any pixel bucket', async ({ report }) => {
  await expect(report.a11ySection).toBeVisible();
  // Leading means first among the RESULT sections (scoped to main — a named
  // header region elsewhere on the page must not red this).
  await expect(report.resultSections.first()).toHaveAccessibleName('Accessibility');
});

Then(
  'the a11y story shows its violations where the diff would be',
  async ({ report }) => {
    const violations = report.violationList(A11Y_STORY);
    await expect(violations).toBeVisible();
    await expect(violations).toContainText(/color-contrast|needs \d+(\.\d+)?:1/);
    // The pane replaces diff — an a11y card renders no diff shot at all.
    await expect(report.diffShot(A11Y_STORY)).toHaveCount(0);
  },
);

Then('the a11y story still counts as an accessibility failure', async ({ report }) => {
  // Reviewed tracks "a human looked"; the bucket outranks the pixel verdict
  // and only a fix clears it. The card copy is pinned in the contract.
  await expect(report.bucketChip('a11y')).toContainText(/[1-9]/);
  await expect(report.a11yRuleNote(A11Y_STORY)).toBeVisible();
});

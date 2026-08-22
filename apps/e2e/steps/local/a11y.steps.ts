import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// Reused steps and their homes — one definition per Gherkin line:
//   "I visit my console"                    → console.steps.ts
//   "this console holds a finished comparison" / "I open one of my reports"
//                                           → report.steps.ts

When('I switch to the dark theme', async ({ chrome }) => {
  await chrome.switchToDarkTheme();
});

Then('the page has no accessibility violations', async ({ chrome }) => {
  // Same scan the acceptance lane runs, from the same place — but pointed at
  // pages this machine's own data drew. A seeded fixture can only fail axe on
  // what it happens to render; a rule that never meets the class it governs
  // reports zero violations and means nothing by it.
  const { violations, summary } = await chrome.axeViolations();
  expect(violations, `accessibility violations: ${summary}`).toEqual([]);
});

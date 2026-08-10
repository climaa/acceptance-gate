import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// "I visit the blog index" (smoke.steps.ts) and "I open the first article"
// (blog.steps.ts) are already defined and reused here — one step definition
// per Gherkin line, shared across every feature.

When('I visit the first tag page', async ({ blogIndex }) => {
  await blogIndex.open();
  await blogIndex.openFirstTag();
});

When('I switch to the dark theme', async ({ chrome }) => {
  await chrome.switchToDarkTheme();
});

Then('the page has no accessibility violations', async ({ page }) => {
  // Settle the initial render so axe evaluates a stable DOM.
  await expect(page.getByRole('heading').first()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // Readable CI failure: rule ids + node counts, not a giant object diff.
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ');
  expect(results.violations, `accessibility violations: ${summary}`).toEqual([]);
});

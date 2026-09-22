import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { PORTFOLIO_LINK } from '../../pages/about';
import { test } from './fixtures';

const { When, Then } = createBdd(test);

When('I visit the about page', async ({ about }) => {
  await about.open();
});

Then('the about page links to the portfolio', async ({ about }) => {
  // At least one, not exactly one: the page carries the link twice on purpose —
  // a lead-in under the heading and an entry under Contact — and pinning the
  // count here would make moving one of them a suite failure rather than an
  // editorial decision.
  const links = about.portfolioLinks;
  await expect(links.first()).toBeVisible();

  const hrefs = await links.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('href')),
  );
  expect(hrefs).toContain(PORTFOLIO_LINK);

  // Same tab. It is the author's own site, so a new window would be the browser
  // deciding something the reader did not ask for, and the back button is the
  // way back.
  await expect(links.first()).not.toHaveAttribute('target', '_blank');
});

Then('the portfolio address answers 200', async ({ about }) => {
  const response = await about.dialPortfolio();

  expect(response.status()).toBe(200);
});

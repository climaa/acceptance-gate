import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

When('I visit the blog index', async ({ blogIndex }) => {
  await blogIndex.open();
});

Then('the page has a main heading', async ({ blogIndex }) => {
  await expect(blogIndex.mainHeading).toBeVisible();
});

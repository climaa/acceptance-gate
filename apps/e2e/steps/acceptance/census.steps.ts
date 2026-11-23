import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

const LEVELS = ['Code', 'Visual', 'Acceptance'] as const;

When('I visit the census home', async ({ census }) => {
  await census.openHome();
});

Then('the page has a main heading {string}', async ({ census }, name: string) => {
  await expect(census.mainHeading).toHaveText(name);
});

Then('the testing pyramid shows a count for each level', async ({ census }) => {
  for (const level of LEVELS) {
    await expect(census.pyramidCount(level)).toHaveText(/^\d[\d,]*/);
  }
});

When('I open a workspace from the home', async ({ census, scenarioState }) => {
  const link = census.firstGapWorkspace();
  scenarioState.workspaceName = (await link.textContent())?.trim();
  await link.click();
});

Then(
  'the workspace page has its name as the main heading',
  async ({ census, scenarioState }) => {
    expect(
      scenarioState.workspaceName,
      'the step before read a workspace name',
    ).toBeTruthy();
    await expect(census.mainHeading).toContainText(scenarioState.workspaceName!);
  },
);

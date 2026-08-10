import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

// Matches the fixture post's title exactly — see
// apps/blog/content/posts/e2e-draft-fixture.mdx. Never flip that post to
// draft: false; this scenario exists to fail loudly if someone does.
const DRAFT_FIXTURE_TITLE = 'Draft fixture — must never be published';

// "I visit the blog index" is already defined in smoke.steps.ts and reused
// here — one step definition per Gherkin line, shared across every feature.

Given('at least one published article exists', async ({ blogIndex }) => {
  await blogIndex.open();
  await expect(blogIndex.articleTitles.first()).toBeVisible();
});

When('I open the first article', async ({ blogIndex, scenarioState }) => {
  scenarioState.articleTitle = await blogIndex.articleTitles.first().innerText();
  await blogIndex.openFirstArticle();
});

Then('I see the list of articles', async ({ blogIndex }) => {
  await expect(blogIndex.articleTitles.first()).toBeVisible();
});

Then('each article shows its date and reading time', async ({ blogIndex }) => {
  const articleCount = await blogIndex.articleTitles.count();

  await expect(blogIndex.articleDates).toHaveCount(articleCount);
  await expect(blogIndex.articleReadingTimes).toHaveCount(articleCount);
});

Then('I see the article body', async ({ post }) => {
  await expect(post.body).toBeVisible();
  await expect(post.body).toHaveText(/\S/);
});

Then("the article title is the page's main heading", async ({ post, scenarioState }) => {
  const { articleTitle } = scenarioState;
  // No fallback: with nothing recorded there is no title to compare against, and
  // defaulting to '' would report a page defect for a mis-ordered scenario.
  if (articleTitle === undefined) {
    throw new Error(
      'No article title recorded — "I open the first article" must run first.',
    );
  }

  await expect(post.mainHeading).toHaveText(articleTitle);
});

Then('no listed article is marked as a draft', async ({ blogIndex }) => {
  await expect(blogIndex.articlesTitled(DRAFT_FIXTURE_TITLE)).toHaveCount(0);
});

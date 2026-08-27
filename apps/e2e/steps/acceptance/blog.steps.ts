import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

// Matches the fixture post's title exactly — see
// apps/blog/content/posts/e2e-draft-fixture.mdx. Never flip that post to
// draft: false; this scenario exists to fail loudly if someone does.
// Exported so there is one string to compare against: the fixture's existence,
// its draft flag and this exact title are pinned by
// apps/blog/__tests__/e2e-draft-fixture.test.ts, which reads this declaration.
export const DRAFT_FIXTURE_TITLE = 'Draft fixture — must never be published';

// The same fixture's address. Pinned to its filename by the same test that pins
// the title above, because `/blog/<slug>` 404s just as convincingly when the
// file has been renamed as when the draft filter is doing its job.
export const DRAFT_FIXTURE_SLUG = 'e2e-draft-fixture';

// Never a post, never a redirect, and shaped like a slug so nothing but the
// route's own refusal can be what answers.
const UNPUBLISHED_SLUG = 'this-post-does-not-exist';

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

When(
  'I request an article address that was never published',
  async ({ post, scenarioState }) => {
    scenarioState.response = await post.requestSlug(UNPUBLISHED_SLUG);
  },
);

When("I request the draft fixture's address", async ({ post, scenarioState }) => {
  scenarioState.response = await post.requestSlug(DRAFT_FIXTURE_SLUG);
});

Then('I see the list of articles', async ({ blogIndex }) => {
  await expect(blogIndex.articleTitles.first()).toBeVisible();
});

Then('each article shows its date and reading time', async ({ blogIndex }) => {
  // Waited for before it is counted: `.count()` does not retry, so on an index
  // that has not rendered it answers 0 and both assertions below hold at 0 ===
  // 0 — a pass that means "there are no articles", not "every article is
  // stamped".
  await expect(blogIndex.articleTitles.first()).toBeVisible();
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

Then('the response status is 404', ({ scenarioState }) => {
  const { response } = scenarioState;
  // No fallback and no optional chain: `undefined?.status()` is `undefined`,
  // which compares unequal to 404 and would report a soft 404 for a scenario
  // that simply never navigated.
  if (!response) {
    throw new Error('No response recorded — a "When I request …" step must run first.');
  }

  expect(response.status()).toBe(404);
});

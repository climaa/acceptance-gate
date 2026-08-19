import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// "I visit the blog index" (smoke.steps.ts) and "I open the first article"
// (blog.steps.ts) are already defined and reused here — one step definition
// per Gherkin line, shared across every feature.

/**
 * Walks the index rather than taking the top of it, because "the first article"
 * is whichever post sorts newest — which is a property of the content, not of
 * the page under test. That is how the code slabs went unscanned: the newest
 * published post happened to be the only one carrying no code fences, so the
 * post-page scenario stayed green for a year of publishing while never once
 * putting a highlighted token in front of axe.
 *
 * Throws rather than skips when nothing matches. A scan that quietly passes on
 * an empty selection is the defect `e2e-draft-fixture.mdx` already exists to
 * prevent one layer down, and repeating it here would leave this scenario
 * exactly as decorative as the one it was added to reinforce.
 */
When(
  'I open the first article carrying a code block',
  async ({ page, blogIndex, post }) => {
    // Same reason as the walk itself throwing: a `.count()` taken before the
    // index renders is 0, the loop never runs, and the error below reports
    // "walked all 0" — which reads as a catalogue with no code blocks rather
    // than as a scan that never started.
    await expect(blogIndex.articleTitles.first()).toBeVisible();
    const listed = await blogIndex.articleTitles.count();

    for (let index = 0; index < listed; index += 1) {
      await blogIndex.openArticleAt(index);
      await expect(post.body).toBeVisible();

      if ((await post.codeBlocks.count()) > 0) return;

      await page.goBack();
    }

    throw new Error(
      `No published article renders a code block — walked all ${listed} on the index. ` +
        'This scenario exists to put highlighted tokens in front of axe, so it fails ' +
        'rather than passes on a catalogue that gives it nothing to look at.',
    );
  },
);

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

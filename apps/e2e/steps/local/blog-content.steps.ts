import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

/**
 * The blog half of the local lane: one scenario, against `next dev`.
 *
 * Every assertion below is a status code and nothing else. What the page draws
 * for a miss is the acceptance lane's business — it has a built server and can
 * name the copy — and what this lane can say that the other cannot is whether
 * the server has noticed a file that changed underneath it.
 */

/** Never written by anything, so it is refused for the one right reason. */
const UNWRITTEN_SLUG = 'no-post-was-ever-here';

/**
 * How long the dev server may take to notice.
 *
 * Polled rather than awaited once: nothing signals when a file lands, and the
 * proxy reads the directory per request in development, so the honest question
 * is "does this settle promptly" and not "is it instant". Well under the
 * config's own `expect.timeout`, because a slow pass here is the failure —
 * a reader who has to restart the server has already lost.
 */
const NOTICE_TIMEOUT = 5_000;

async function expectStatus(
  request: () => Promise<{ status(): number } | null>,
  status: number,
) {
  await expect
    .poll(async () => (await request())?.status(), { timeout: NOTICE_TIMEOUT })
    .toBe(status);
}

Given('the blog dev server is serving my own content', async ({ blogDev }) => {
  const response = await blogDev.request('/blog');

  expect(response?.status()).toBe(200);
});

When('I write a new post into my posts directory', async ({ contentProbe }) => {
  contentProbe.write();
});

Then(
  'its address answers without restarting the server',
  async ({ blogDev, contentProbe }) => {
    await expectStatus(() => blogDev.request(`/blog/${contentProbe.slug}`), 200);
  },
);

Then('an address I never wrote is still refused', async ({ blogDev }) => {
  // The control. Without it the scenario above passes just as well against a
  // server that answers 200 to every address under /blog — which is exactly the
  // defect the proxy was added to fix, so it is the one regression this file
  // must not be blind to.
  await expectStatus(() => blogDev.request(`/blog/${UNWRITTEN_SLUG}`), 404);
});

When('I remove that post again', async ({ contentProbe }) => {
  contentProbe.remove();
});

Then('its address is refused too', async ({ blogDev, contentProbe }) => {
  await expectStatus(() => blogDev.request(`/blog/${contentProbe.slug}`), 404);
});

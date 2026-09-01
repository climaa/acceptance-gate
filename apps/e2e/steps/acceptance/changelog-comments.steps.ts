import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

/**
 * The release conversations, from outside.
 *
 * Every claim here is about what the reader can perceive: what the control
 * calls itself, whether an embed exists, and what the page says in writing. Not
 * once about the animation — asserting on the pixels of a canvas is
 * visual-diff's job, and a scenario that tried would be pinning the artwork
 * from the wrong layer.
 *
 * That the icon is never the thing being asserted is also what makes these
 * scenarios honest about the control. The player is a WebAssembly renderer
 * fetched on demand; if it never arrives, the button still has its name, still
 * mounts the thread, and still says what went wrong. These pass in that case,
 * which is the correct answer — the feature is the conversation, and the
 * animation is how it is narrated.
 */

/** How long a mounted embed is given to announce itself. Well inside the app's own 15s. */
const THREAD_TIMEOUT = 10_000;

Given('the changelog lists its releases', async ({ changelog, giscus }) => {
  // The service is stood up BEFORE the page is opened, so a route is never
  // added after the request it was meant to intercept.
  await giscus.serveWorkingEmbed();
  await changelog.open();

  await expect(changelog.releases.first()).toBeVisible();
});

Given('the comment service cannot be reached', async ({ page, giscus }) => {
  // Replaces the working routes stood up in the Background — a later
  // `page.route` for the same pattern takes precedence over an earlier one.
  await giscus.serveUnreachable();
  // Belt and braces: the frame URL must not answer either, so a scenario
  // cannot pass because a stale route mounted something.
  await page.unroute('https://giscus.app/__e2e__/thread*');
});

/**
 * "The newest release" rather than a version number, for the reason no step in
 * this suite names a slug: the release list is content. A scenario naming
 * `v1.3.0` reports the next release as a defect.
 */
async function newestTag(changelog: {
  releaseTags(): Promise<string[]>;
}): Promise<string> {
  const [newest] = await changelog.releaseTags();
  if (!newest) throw new Error('The changelog rendered no releases to ask about.');
  return newest;
}

When(
  'I ask for the conversation about the newest release',
  async ({ changelog, scenarioState }) => {
    const tag = await newestTag(changelog);
    scenarioState.releaseTag = tag;

    await changelog.syncButtonFor(tag).click();
  },
);

Given(
  'I have opened the conversation about the newest release',
  async ({ changelog, scenarioState }) => {
    const tag = await newestTag(changelog);
    scenarioState.releaseTag = tag;

    await changelog.syncButtonFor(tag).click();
    await expect(changelog.threadFrameFor(tag)).toBeAttached({ timeout: THREAD_TIMEOUT });
    // Waited for, not assumed: pressing again while the first mount is still in
    // flight is a different scenario from pressing again after it landed, and
    // without this the two would be decided by a race.
    await expect(changelog.syncButtonFor(tag)).toHaveAttribute('data-status', 'ready', {
      timeout: THREAD_TIMEOUT,
    });
  },
);

When('I ask again', async ({ changelog, scenarioState }) => {
  const tag = recordedTag(scenarioState);
  await changelog.syncButtonFor(tag).click();
});

/**
 * The second release, not the last one.
 *
 * The last entry cannot always be scrolled to the top — a page bottoms out, and
 * a final release shorter than the viewport leaves the one above it still
 * showing and still winning as "first in document order on screen". Choosing an
 * entry that has releases below it means the scroll can always put it at the
 * top, so the scenario tests the control's aim rather than the fixture's
 * heights.
 */
When('I scroll to an older release', async ({ changelog, scenarioState }) => {
  const tags = await changelog.releaseTags();
  const [newest, older] = tags;

  if (!newest || !older) {
    throw new Error(
      `This scenario needs at least two releases to tell one from another — the page rendered ${tags.length}.`,
    );
  }

  scenarioState.releaseTag = older;
  await changelog.scrollToTop(older);
});

Then(
  'the conversation about that release is on the page',
  async ({ changelog, scenarioState }) => {
    const tag = recordedTag(scenarioState);

    await expect(changelog.threadFrameFor(tag)).toBeAttached({ timeout: THREAD_TIMEOUT });
  },
);

Then('no conversation has been loaded', async ({ giscus }) => {
  // The economy the whole design is for: four embeds on every visit would be
  // four iframes and four sets of requests, paid by every reader including the
  // ones who never open a conversation.
  expect(await giscus.mountedThreadCount()).toBe(0);
});

Then('only one conversation has been loaded', async ({ giscus }) => {
  expect(await giscus.mountedThreadCount()).toBe(1);
});

/**
 * The control's accessible name, waited for rather than read once.
 *
 * The name is what the control promises a press will DO, so every claim about
 * which state it has reached is a claim about this string. Polled because the
 * states these scenarios wait on arrive by a network round trip or by a timer,
 * neither of which has landed when the step begins.
 */
async function expectOffer(
  changelog: { syncButtonName(tag: string): Promise<string> },
  tag: string,
  offer: RegExp,
) {
  await expect
    .poll(() => changelog.syncButtonName(tag), { timeout: THREAD_TIMEOUT })
    .toMatch(offer);
}

/** What the control calls itself in each state a scenario asserts on. */
const OFFERS = {
  load: /^Load the conversation/,
  goTo: /^Go to the conversation/,
  retry: /^Retry loading the conversation/,
};

Then('the control offers to take me to it', async ({ changelog, scenarioState }) => {
  await expectOffer(changelog, recordedTag(scenarioState), OFFERS.goTo);
});

Then(
  'the control still offers to take me to it',
  async ({ changelog, scenarioState }) => {
    const tag = recordedTag(scenarioState);

    // The point of the scenario: a second press MOVES, and does not restart a
    // load. A control that went back to "Loading" here would be animating work it
    // is not doing.
    await expect(changelog.syncButtonFor(tag)).toHaveAttribute('data-status', 'ready');
    expect(await changelog.syncButtonName(tag)).toMatch(OFFERS.goTo);
  },
);

Then('the control offers to retry', async ({ changelog, scenarioState }) => {
  // Retry, never the check mark. The failure has to end somewhere a reader can
  // act from, and it must never end anywhere that claims success.
  await expectOffer(changelog, recordedTag(scenarioState), OFFERS.retry);
});

Then(
  'the page states in writing that the conversation could not be loaded',
  async ({ changelog }) => {
    // The colour is not the message. A reader who cannot see the icon — or who
    // has reduced motion on and is looking at a still — gets nothing from a red
    // ring, so the failure is written down as well as drawn.
    await expect(changelog.note).toHaveText(/could not be loaded/);
  },
);

Then('the control names that release', async ({ changelog, scenarioState }) => {
  const tag = recordedTag(scenarioState);

  await expect(changelog.syncButtonFor(tag)).toBeVisible();
  expect(await changelog.syncButtonName(tag)).toContain(tag);
});

Then(
  'the control offers to load its conversation',
  async ({ changelog, scenarioState }) => {
    // Scrolling to a release nobody has asked about must not inherit another
    // release's state — a check mark that survived the scroll would be claiming a
    // thread is open for a version that has never been asked for.
    await expectOffer(changelog, recordedTag(scenarioState), OFFERS.load);
  },
);

/** The release the scenario is about, or a failure that says which step is missing. */
function recordedTag(scenarioState: { releaseTag?: string }): string {
  const { releaseTag } = scenarioState;
  // No fallback: with nothing recorded there is no release to ask about, and
  // defaulting to the newest would let a mis-ordered scenario pass by testing
  // something it never selected.
  if (releaseTag === undefined) {
    throw new Error('No release recorded — a step that selects one must run first.');
  }

  return releaseTag;
}

import type { Route } from '@playwright/test';
import { test as base } from 'playwright-bdd';

import { Chrome } from '../../pages/chrome';
import { ConsolePage } from '../../pages/console';
import { ReportPage } from '../../pages/report';

/** The only two methods a lane pointed at the one copy of your data may use. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

/** Everything this lane's own server answers. Third-party origins are not this
 *  guard's business, and the app talks to none. */
const APP_ORIGIN = 'http://localhost:3300/**';

/**
 * What one scenario's steps hand each other. Real data cannot be named in a
 * `.feature`, so the values an assertion needs are read off the page by an
 * earlier step and compared here — which is what makes these scenarios
 * invariants rather than facts.
 */
export interface LocalState {
  /** Set labels read out of the sets table, in listed order. */
  setLabels?: string[];
  /** The two sets a compare step chose, as their option labels. */
  chosen?: { a: string; b: string };
  /** The report id an earlier step opened, read off the console's own link. */
  reportId?: string;
  /** Bucket counts read off the chip row: bucket word → count. */
  counts?: Record<string, number>;
  /** How many history rows the console showed when the scenario arrived — what
   *  "no job has been started" is compared against. */
  historyDepth?: number;
}

/**
 * The local lane's `test`, named in `playwright.local.config.ts` as
 * `importTestFrom`. Two lanes now export a `test`, and the generated specs must
 * not be left to guess which: the acceptance lane's fixtures navigate to
 * absolute world URLs on 3200-3202, so a local scenario that bound to them
 * would silently leave the dev server this config booted.
 *
 * Page objects come from the shared `pages/` — the same markup contract the
 * acceptance suite trusts, so a rename in the app fails both lanes in one file.
 */
export const test = base.extend<{
  chrome: Chrome;
  console: ConsolePage;
  report: ReportPage;
  localState: LocalState;
  readOnly: void;
}>({
  chrome: async ({ page }, use) => {
    await use(new Chrome(page));
  },
  console: async ({ page }, use) => {
    await use(new ConsolePage(page));
  },
  report: async ({ page }, use) => {
    await use(new ReportPage(page));
  },
  localState: async ({}, use) => {
    await use({});
  },

  /**
   * The read-only rule, as a tripwire rather than a promise.
   *
   * `apps/e2e/README.md` says nothing in this lane may delete, prune, accept or
   * start a job, because the tree behind 3300 is the one copy you have. Prose is
   * not a guard: a step that grew a `.click()` on the wrong button would run,
   * pass, and take a snapshot set with it. So every non-GET request this lane's
   * pages make is ABORTED before it reaches the server, and the scenario fails
   * at teardown naming what it tried — the write is prevented first and reported
   * second, in that order, because reporting a write that already landed is a
   * post-mortem.
   *
   * Aborting rather than failing inside the handler is deliberate: a throw from
   * a route callback is swallowed by Playwright and the request goes through.
   */
  readOnly: [
    async ({ page }, use) => {
      const attempted: string[] = [];

      await page.route(APP_ORIGIN, async (route: Route) => {
        const request = route.request();
        const method = request.method();

        if (READ_ONLY_METHODS.has(method)) return route.continue();

        attempted.push(`${method} ${request.url()}`);

        return route.abort('blockedbyclient');
      });

      await use();

      if (attempted.length > 0) {
        throw new Error(
          'This lane runs against your real .visual-diff tree and is strictly read-only, ' +
            'so the following request(s) were blocked before reaching the server:\n  ' +
            attempted.join('\n  ') +
            '\nA scenario here may never delete, prune, accept or start a job. Move it to ' +
            'features/acceptance/ with a @mutating tag, where the world is seeded and ' +
            'disposable.',
        );
      }
    },
    { auto: true },
  ],
});

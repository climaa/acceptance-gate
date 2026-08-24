import type { Route } from '@playwright/test';
import { test as base } from 'playwright-bdd';

import { ConsolePage } from '../../pages/console';
import { ReportPage } from '../../pages/report';

/** The only two methods a lane pointed at the one copy of your data may use. */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD']);

/**
 * The one tag that opts a scenario out of the two guards below.
 *
 * It is not the acceptance lane's `@mutating`, which is a PROJECT selector:
 * this config has one project and no grep, so a tag selects nothing here. What
 * it does here is the whole of its meaning — it is the declaration that a
 * scenario writes to your real tree, made in the `.feature` where a reader sees
 * it, and read back at runtime from `testInfo.tags`.
 *
 * `scripts/local-integrity.mjs` is what keeps it from being self-granted: the
 * tag is refused on a Feature node and outside the one file that declares it,
 * so adding it is a diff someone reviews rather than the quickest way past a
 * failure.
 */
const MUTATING_TAG = '@mutating';

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
  /** The report id an earlier step opened, read off the console's own link. */
  reportId?: string;
  /** Set labels read out of the sets table, in listed order — what a scenario
   *  that changes the table compares the new table against. */
  setLabels?: string[];
  /** The set a delete step aimed at, so the assertion after it can name the row
   *  that must be gone rather than re-reading the table and agreeing with it. */
  deletedSet?: string;
  /** The label the console suggested for a capture, read out of the field the
   *  wand filled — so the step that starts the run and the one that reads the
   *  history afterwards are talking about the same set. */
  capturedLabel?: string;
}

/**
 * The local lane's `test`, named in `playwright.local.config.ts` as
 * `importTestFrom`. Two lanes now export a `test`, and the generated specs must
 * not be left to guess which: the acceptance lane's fixtures navigate to
 * absolute world URLs on 3200-3201, so a local scenario that bound to them
 * would silently leave the dev server this config booted.
 *
 * Page objects come from the shared `pages/` — the same markup contract the
 * acceptance suite trusts, so a rename in the app fails both lanes in one file.
 */
export const test = base.extend<{
  console: ConsolePage;
  report: ReportPage;
  localState: LocalState;
  mayWrite: void;
  readOnly: void;
}>({
  console: async ({ page }, use) => {
    await use(new ConsolePage(page));
  },
  /**
   * The report screen, for the flow that reads one through before accepting it.
   *
   * Reached only through `openHere`, never `open`: the latter takes a
   * `VdWorld` and resolves to the acceptance suite's absolute host on 3200,
   * which is exactly the leak this lane's separate `test` exists to prevent.
   */
  report: async ({ page }, use) => {
    await use(new ReportPage(page));
  },
  localState: async ({}, use) => {
    await use({});
  },

  /**
   * The same rule, for the writes no browser makes.
   *
   * `readOnly` below is a `page.route` handler, so it sees requests the app's
   * pages make and nothing else. A step reaching for `node:fs` — writing the job
   * lock, editing `history.json` — walks straight past it, and playwright-bdd
   * resolves steps by TEXT across the whole `steps/local/**` glob, so any
   * scenario in this lane can call one of those steps by name whether or not it
   * carries the tag.
   *
   * So the permission is checked where the write happens. A step that touches
   * the tree asks for this fixture; asking for it from an untagged scenario is
   * the error below, before the step body runs. Not `auto: true` on purpose —
   * declaring it IS the step saying what it is about to do.
   */
  mayWrite: async ({}, use, testInfo) => {
    if (!testInfo.tags.includes(MUTATING_TAG)) {
      throw new Error(
        `This step writes to your real .visual-diff tree, and "${testInfo.title}" is not ` +
          `tagged ${MUTATING_TAG}. Tag the scenario in its feature file — and note that ` +
          'scripts/local-integrity.mjs only permits that inside the files named in its ' +
          'MUTATING_FEATURES, so this is a decision someone reviews.',
      );
    }

    await use();
  },

  /**
   * The read-only rule, as a tripwire rather than a promise.
   *
   * `apps/e2e/README.md` says nothing in this lane may delete, prune, accept or
   * start a job UNLESS its scenario is tagged `@mutating`, because the tree
   * behind 3300 is the one copy you have. Prose is not a guard: a step that grew
   * a `.click()` on the wrong button would run, pass, and take a snapshot set
   * with it. So every non-GET request an untagged scenario's pages make is
   * ABORTED before it reaches the server, and the scenario fails at teardown
   * naming what it tried — the write is prevented first and reported second, in
   * that order, because reporting a write that already landed is a post-mortem.
   *
   * The tag is the ONLY way through, it is declared per scenario in the feature
   * file, `scripts/local-integrity.mjs` refuses it on a Feature node and outside
   * the files it names, and `features/local/visual-diff-flow.feature` is the
   * only one it names today. Writes that never reach the network are guarded by
   * `mayWrite` above.
   *
   * Every scenario in the lane carries the tag today, so neither guard refuses
   * anything on a normal run. That is not a reason to drop them: what they
   * protect is the scenario nobody has written yet. The read-only half of this
   * lane was withdrawn one file at a time, and the next thing added here will
   * be read-only again far more easily than it will be deliberately mutating.
   *
   * Aborting rather than failing inside the handler is deliberate: a throw from
   * a route callback is swallowed by Playwright and the request goes through.
   */
  readOnly: [
    async ({ page }, use, testInfo) => {
      // A `@mutating` scenario says out loud, in its own feature file, that it
      // writes — so the tripwire stands aside rather than aborting the requests
      // the scenario exists to make. Everything untagged in this lane is still
      // protected, which is the point of keying on the tag rather than on the
      // config: one lane, two kinds of scenario, and the difference is legible
      // in the Gherkin.
      if (testInfo.tags.includes(MUTATING_TAG)) {
        await use();

        return;
      }

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
            '\nAn untagged scenario here may never delete, prune, accept or start a job. ' +
            'Either move it to features/acceptance/ with a @mutating tag, where the world ' +
            'is seeded and disposable, or — if it genuinely means to write to YOUR tree — ' +
            'tag it @mutating here and say so in its feature file.',
        );
      }
    },
    { auto: true },
  ],
});

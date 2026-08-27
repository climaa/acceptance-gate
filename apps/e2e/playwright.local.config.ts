import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

import { BLOG_DEV_URL } from './pages/blog-dev';

/**
 * The LOCAL lane — deliberately not the acceptance suite.
 *
 * `playwright.config.ts` runs `features/acceptance/` against built apps and
 * seeded worlds, and every one of its assertions names a seed fact. This config
 * answers a different question: does the console work against YOUR data — the
 * real `.visual-diff` tree the dev server on 3300 reads. Its requirements live
 * in `features/local/`, in the same Gherkin the acceptance lane uses.
 *
 * ⚠️ Every scenario here WRITES, to two different trees of yours. The console
 * flow launches a job, deletes your oldest capture set and prunes one more, and
 * nothing re-seeds afterwards. The blog scenario creates a post file in
 * `apps/blog/content/posts` and removes it again — it restores what it touched,
 * which the console flow deliberately does not. There is no read-only scenario
 * left: `report.feature` was the last of it and was withdrawn.
 *
 * The guards in `steps/local/fixtures.ts` stay anyway. `readOnly` aborts every
 * non-GET an untagged scenario makes and `mayWrite` refuses an untagged step
 * that reaches for the filesystem — neither refuses anything today, because
 * every scenario carries `@mutating`, and both are here for the scenario nobody
 * has written yet.
 *
 * Because real data cannot be named, no scenario here asserts a label, a report
 * id or a count. Each step reads what it needs off the page: the flow compares
 * the two sets the pickers offer and deletes "my oldest set", never a set anyone
 * chose. The journeys that need named facts — the review loop, the comparison
 * modal, the accept gate's refusals — stay in the acceptance lane.
 *
 * The blog joined the lane for the same reason the console is in it: there is a
 * claim about `next dev` that no build can make. `apps/blog/proxy.ts` decides
 * whether an address exists by reading `content/posts`, and it caches that read
 * in production, where the content cannot move. In development it must not — a
 * post written while the server runs has to be reachable at once — and the
 * acceptance lane never sees a dev server, so nothing there can say so.
 *
 * Both dev servers are reused if `pnpm dev` already has them up, and booted (and
 * torn down) here if not.
 */

// A second, isolated BDD config. `outputDir` is explicit because the default is
// `.features-gen`, which belongs to the acceptance lane — two lanes generating
// into one directory would have each `bddgen` delete the other's specs. The
// `steps` glob is what binds these specs to THIS lane's `test`: it reaches
// `steps/local/fixtures.ts` and never the acceptance lane's, whose page objects
// navigate to absolute world URLs on 3200-3201.
const testDir = defineBddConfig({
  features: 'features/local/**/*.feature',
  steps: 'steps/local/**/*.ts',
  outputDir: '.features-gen-local',
});

const LOCAL_URL = 'http://localhost:3300';

// Real local data cannot exist in CI, so a CI run of this config could only
// ever be aimed at something that is not this PR's build — same reasoning as
// the E2E_BASE_URL refusal in the main config.
if (process.env.CI) {
  throw new Error(
    'playwright.local.config.ts validates the machine-local .visual-diff data: it has no meaning in CI. Run the acceptance suite instead.',
  );
}

export default defineConfig({
  testDir,
  // Separate artifact dirs so a local exploration never clobbers the last
  // acceptance run's report.
  outputDir: 'test-results-local',
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-local' }]],
  // Thirty minutes, for one test that is a whole workflow: a Storybook rebuild,
  // a container capture of the entire corpus, a compare, a review pass and a
  // promote. This used to be 30 s and the long waits inside the steps
  // (JOB_TIMEOUT, PROMOTE_TIMEOUT) were decorative — each scenario was its own
  // test with its own fresh slot, and the `:accept` scripts passed `--timeout`
  // on the CLI to paper over the rest. With one test they all share this budget,
  // and at 30 s the lane would die mid-capture with `Test timeout exceeded` and
  // no locator diagnostics.
  //
  // Generous is safe here in a way it would not be in the acceptance lane: there
  // is one test, so there is no fast scenario left to over-grant.
  timeout: 30 * 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  // One worker, and no retry above.
  //
  // There are two files now, and Playwright runs separate files in parallel by
  // default — so this line is load-bearing rather than incidental. Anything
  // running beside a flow that deletes capture sets would be reading a tree
  // being rewritten underneath it, and the blog scenario adds and removes a post
  // that the console's own Storybook capture would otherwise see appear
  // mid-run: races that pass most of the time, which is the worst kind. The
  // acceptance lane answered the same problem by giving `@mutating` a project of
  // its own; a lane with one project answers it here.
  //
  // A retry is worse here than useless: nothing re-seeds your `.visual-diff`, so
  // the second attempt would run against the tree the first one already pruned.
  workers: 1,
  use: {
    baseURL: LOCAL_URL,
    trace: 'retain-on-failure',
  },
  // One project. The console is a desktop surface, and the mobile presentations
  // that do differ — the comparison sheet below 768px — belong to scenarios this
  // lane deliberately does not carry.
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @gate/visual-diff-ui dev',
      url: LOCAL_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @gate/blog dev',
      url: BLOG_DEV_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

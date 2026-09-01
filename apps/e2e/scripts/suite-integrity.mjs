// Acceptance-suite integrity guard. Fails if the suite still exits 0 while
// claiming less than it did.
//
// `apps/e2e/README.md` already says a `.feature` file is a product requirement
// and is never edited to make a test pass. That is prose, and prose is not a
// tripwire — this file is. It runs before `playwright test` in `test:e2e`, so a
// suite that has been quietly narrowed fails the check that was supposed to
// exercise it rather than passing it.
//
// The checks themselves live in `lib/suite-integrity-core.mjs`, shared with the
// local lane's guard; what is lane-specific is here.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLaneCoverage, runIntegrityCheck } from './lib/suite-integrity-core.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every lane that compiles `.feature` files, by its directory under `features/`.
 *  Checked here rather than in the local guard because this one runs in CI, and
 *  a requirement filed in no lane should be caught on the pull request that
 *  files it. */
const LANES = ['acceptance', 'local'];

/**
 * Scenarios, not Playwright tests: 9 blog + 6 visual-diff console + 4 sample
 * mode + 15 report + 7 accessibility. Test count is
 * higher, because an untagged scenario is listed once per project; one
 * legitimate `@desktop` lowers that number without removing a requirement,
 * which would train everyone to edit this constant for a non-event. Scenario
 * count moves only when a requirement is added or removed.
 *
 * It was 40 until the sample console was made to draw no destructive control at
 * all. Two consoles cannot mutate — a deployed one, refused with `NOT_LOCAL`,
 * and one serving the committed fixtures, refused with `SAMPLE_DATA` — and the
 * tables kept only the first half of that rule for three pull requests, because
 * nothing here said otherwise. The unit tests cover the branch; this is the
 * requirement, and it belongs in the suite because the fixtures a sample console
 * would have offered to delete are this repo's own files.
 *
 * It was 43 until the console's accept tab was retired. The three baseline-
 * acceptance scenarios went with it: the tab spawned `promote`, which writes
 * `<dataDir>/__baselines__` — gitignored, and never the corpus CI compares
 * against — so what they vouched for was a control that could not produce the
 * sign-off it looked like. Accepting is a commit now, and the workflow that
 * makes it has no browser surface for this suite to drive.
 *
 * It was 42 until the run panel's mode tabs started writing the selected tab to
 * the URL. The scenario added with it reloads the page rather than visiting a
 * deep link someone typed, which is the half no unit test reaches: the stubbed
 * `next/navigation` records what `router.replace` was CALLED with, and only a
 * browser can say that the address it wrote is one the app comes back up on.
 *
 * It was 41 before that, until the console gained a control that names the next
 * capture set for the reviewer; the scenario added with it is the one
 * requirement that cannot be met by a unit test, because everything below the
 * browser stubs the fetch the wand makes.
 *
 * It was 44 until `/changelog` gained the control that opens a release's
 * conversation. Six scenarios came with it: five for the control, and one more
 * putting the page in front of axe. All six are requirements no unit test can
 * meet — the control's whole subject is an embed from another origin, and what
 * is being asserted is that a press mounts one, that a second press does not
 * mount a second, and that a mount that fails ends somewhere a reader can act
 * from and says so in writing. Every one of those claims is about a real
 * cross-origin frame, which is why the comment service is faked at the network
 * boundary rather than stubbed inside the page: see `pages/giscus.ts`.
 *
 * It was 47 before that, until the six `@mutating` requirements were withdrawn
 * from this suite. They are not gone — they run in `features/local/`, against the tree on
 * the machine doing the running — but nothing gates them on a pull request any
 * more, and this number is where that decision is recorded.
 *
 * It was 42 until `/blog/[slug]` and `/tags/[tag]` were made to answer a real
 * 404. Both declared `generateStaticParams()` and no `dynamicParams`, so an
 * unknown slug rendered on demand, `notFound()` fired after the response had
 * already committed 200, and the not-found body was cached and served with that
 * status — a slug that had never existed answered 200. The two scenarios added
 * with it are requirements no unit test can meet: the body was always right, so
 * the status code is the entire claim, and only something that speaks HTTP can
 * read it back.
 *
 * Exact equality, not a floor: a floor decays, and after ten more scenarios a
 * floor of 47 would permit deleting ten of them. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a product decision and belongs in
 * its own hand-authored PR with the reason written down.
 */
const EXPECTED_SCENARIOS = 50;

/** The two project selectors. Carrying both excludes a scenario from both. */
const PROJECT_TAGS = ['@desktop', '@mobile'];

/** `desktop` carries grepInvert /@mobile/ and `mobile` carries /@desktop/, so a
 *  scenario with both is excluded from both — while every other scenario still
 *  runs, so Playwright's "No tests found" never fires. Two words, one
 *  requirement gone. Named here rather than left to surface as a count. */
function checkProjectTags(file, feature) {
  const inherited = feature.featureTags;

  return feature.scenarios
    .filter(({ tags }) =>
      PROJECT_TAGS.every((wanted) =>
        [...inherited, ...tags].some(({ tag }) => tag === wanted),
      ),
    )
    .map(({ title, tags }) => {
      // Own tag first; a scenario that inherits both from the Feature has none.
      const line = (tags[0] ?? inherited[0]).line;

      return `${file}:${line} — "${title}" is tagged @desktop and @mobile, so both projects exclude it`;
    });
}

runIntegrityCheck({
  name: 'acceptance-suite',
  workspace,
  featuresDir: 'features/acceptance',
  expected: EXPECTED_SCENARIOS,
  expectedName: 'EXPECTED_SCENARIOS',
  checkTags: checkProjectTags,
  extraChecks: () => checkLaneCoverage(join(workspace, 'features'), LANES),
});

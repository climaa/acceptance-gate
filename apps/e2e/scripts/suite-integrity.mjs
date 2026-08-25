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
 * Scenarios, not Playwright tests: 9 blog + 6 visual-diff console + 3 sample
 * mode + 15 report + 7 accessibility. Test count is
 * higher, because an untagged scenario is listed once per project; one
 * legitimate `@desktop` lowers that number without removing a requirement,
 * which would train everyone to edit this constant for a non-event. Scenario
 * count moves only when a requirement is added or removed.
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
 * It was 47 before that, until the six `@mutating` requirements were withdrawn
 * from this suite. They are not gone — they run in `features/local/`, against the tree on
 * the machine doing the running — but nothing gates them on a pull request any
 * more, and this number is where that decision is recorded.
 *
 * Exact equality, not a floor: a floor decays, and after ten more scenarios a
 * floor of 47 would permit deleting ten of them. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a product decision and belongs in
 * its own hand-authored PR with the reason written down.
 */
const EXPECTED_SCENARIOS = 40;

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

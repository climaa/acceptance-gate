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
 * The one file whose scenarios are steps of a flow rather than independent
 * requirements, and the only place `@mode:serial` may appear.
 *
 * Membership is a claim about the scenarios, not a permission: these six wreck
 * one data directory in the order they are written, so a failure must stop the
 * rest instead of producing four more failures that all describe the first one.
 * The core refuses the tag on every other file, refuses it on a scenario in this
 * one, and refuses this entry if the file ever stops carrying it.
 */
const SERIAL_FEATURES = ['visual-diff-flow.feature'];

/**
 * Scenarios, not Playwright tests: 9 blog + 4 visual-diff console + 3 sample
 * mode + 15 report + 7 accessibility + 3 baseline acceptance + 6 mutating flow.
 * Test count is higher, because an untagged scenario is listed once per project; one
 * legitimate `@desktop` lowers that number without removing a requirement,
 * which would train everyone to edit this constant for a non-event. Scenario
 * count moves only when a requirement is added or removed.
 *
 * Exact equality, not a floor: a floor decays, and after ten more scenarios a
 * floor of 47 would permit deleting ten of them. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a product decision and belongs in
 * its own hand-authored PR with the reason written down.
 */
const EXPECTED_SCENARIOS = 47;

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
  serialFeatures: SERIAL_FEATURES,
  checkTags: checkProjectTags,
  extraChecks: () => checkLaneCoverage(join(workspace, 'features'), LANES),
});

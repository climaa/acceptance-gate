// Local-lane integrity guard — the same discipline as the acceptance suite's,
// for the lane that runs against your own `.visual-diff` tree.
//
// This lane never runs in CI (playwright.local.config.ts refuses), so nothing
// downstream would ever notice it being hollowed out. That is exactly why it
// gets a guard: a suite with no gate behind it is the easiest one to quietly
// narrow. It runs inside `test:local` and `e2e:ui:local`, before either opens a
// browser.
//
// The checks live in `lib/suite-integrity-core.mjs`, shared with the acceptance
// guard; what is lane-specific is here — which config to list, which directory
// holds the features, and how many scenarios the lane must have.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runIntegrityCheck } from './lib/suite-integrity-core.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = 'playwright.local.config.ts';

/**
 * The one file in this lane whose scenarios are steps of a flow, and the only
 * place `@mode:serial` may appear.
 *
 * Serial is what keeps the writing below honest: these scenarios change a real
 * tree in sequence, each assuming what the one before it did, so a failure has
 * to stop the rest rather than let a delete run against a console that never
 * got its compare.
 */
const SERIAL_FEATURES = ['visual-diff-flow.feature'];

/**
 * The write permission, as a list.
 *
 * `@mutating` means something different in this lane than in the acceptance
 * suite. There it selects a project. Here it is the ONLY thing that opts a
 * scenario out of the read-only tripwire in `steps/local/fixtures.ts` — the tree
 * behind 3300 is the one copy you have, and a scenario carrying this tag may
 * delete a capture set of yours.
 *
 * A permission that anyone can grant themselves is not a permission. Without the
 * rule below, the fastest way past a tripwire failure is to add the tag the
 * error message just named, in the file you were already editing, and both
 * guards stay green — the "weakening an assertion" move `apps/e2e/README.md`
 * refuses by name, wearing a different hat.
 */
const MUTATING_FEATURES = ['visual-diff-flow.feature'];

const MUTATING_TAG = '@mutating';

/**
 * `@mutating` sits on scenarios, in a file that declared it, and never on a
 * Feature.
 *
 * Per scenario because that is the line a reviewer objects to: on the Feature it
 * is inherited silently, and the sixth scenario someone appends to a flow file
 * gets permission to delete your captures without a word of its own in the diff.
 *
 * The reverse is checked too — an allowlisted file with no tagged scenario is
 * either a flow that quietly stopped writing or an entry nobody removed, and
 * both read as "writing is permitted here" to whoever looks next.
 */
function checkMutatingTags(file, feature) {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const allowed = MUTATING_FEATURES.includes(name);

  const onFeature = feature.featureTags.filter(({ tag }) => tag === MUTATING_TAG);
  const tagged = feature.scenarios.filter(({ tags }) =>
    tags.some(({ tag }) => tag === MUTATING_TAG),
  );

  const failures = onFeature.map(
    ({ line }) =>
      `${file}:${line} — ${MUTATING_TAG} on the Feature grants every scenario in this ` +
      `file the right to write to your .visual-diff, including the next one added. ` +
      `Put it on each scenario that writes.`,
  );

  if (!allowed) {
    failures.push(
      ...tagged.map(({ title, tags }) => {
        const line = tags.find(({ tag }) => tag === MUTATING_TAG)?.line ?? 1;

        return (
          `${file}:${line} — "${title}" carries ${MUTATING_TAG}, which opts it out of the ` +
          `read-only tripwire and lets it delete your captures. Only ` +
          `${MUTATING_FEATURES.join(', ')} may do that.`
        );
      }),
    );
  } else if (tagged.length === 0 && onFeature.length === 0) {
    failures.push(
      `${file} is named in MUTATING_FEATURES but no scenario carries ${MUTATING_TAG} — ` +
        `either tag the ones that write or drop it from the list`,
    );
  }

  return failures;
}

/**
 * Scenarios, not Playwright tests: the five in the mutating flow, which is now
 * the whole lane. This lane has one project, so the two numbers agree today —
 * they would stop agreeing the moment a second project is added, which is why
 * the count is of scenarios either way.
 *
 * It was 20 — 8 console, 6 report, 3 accessibility, 3 edge cases. The console,
 * accessibility and edge-case requirements were withdrawn first, leaving 6; the
 * flow added 5; then `report.feature` was withdrawn too. Each fall was its own
 * hand-authored change, which is the only way this number may drop.
 *
 * What that leaves is a lane where every scenario writes. Nothing here reads
 * your console without changing it.
 *
 * Exact equality, not a floor, for the same reason the acceptance suite's is:
 * a floor decays into permission to delete. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a decision about what this lane
 * claims, and belongs in its own hand-authored change with the reason written
 * down.
 */
const EXPECTED_LOCAL_SCENARIOS = 5;

runIntegrityCheck({
  name: 'local-lane',
  workspace,
  config: CONFIG,
  featuresDir: 'features/local',
  expected: EXPECTED_LOCAL_SCENARIOS,
  expectedName: 'EXPECTED_LOCAL_SCENARIOS',
  serialFeatures: SERIAL_FEATURES,
  checkTags: checkMutatingTags,
});

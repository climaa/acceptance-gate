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
// guard; what is lane-specific is here.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runIntegrityCheck } from './lib/suite-integrity-core.mjs';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG = 'playwright.local.config.ts';

/**
 * Scenarios, not Playwright tests: 8 console + 6 report + 3 accessibility +
 * 3 edge cases. This lane has one project, so the two numbers agree today —
 * they would stop agreeing the moment a second project is added, which is why
 * the count is of scenarios either way.
 *
 * Exact equality, not a floor, for the same reason the acceptance suite's is:
 * a floor decays into permission to delete. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a decision about what this lane
 * claims, and belongs in its own hand-authored change with the reason written
 * down.
 */
const EXPECTED_LOCAL_SCENARIOS = 20;

/**
 * The execution levels this lane declares. There is deliberately no `@smoke`:
 * a smoke level exists to fail a pipeline fast, and nothing here gates
 * anything — every scenario is either a `@regression` claim about the console
 * or an `@edge-case` negative.
 */
const LEVEL_TAGS = ['@regression', '@edge-case'];

/**
 * Exactly one level per scenario.
 *
 * The levels are selected with UI Mode's tag filter or `--grep`, and both are
 * denylist-free: an untagged scenario is not refused by them, it is simply never
 * chosen. So a scenario that loses its tag stops running the moment anyone
 * filters, without the count moving and without anything going red. Two levels
 * at once is the same defect from the other side — the scenario answers to a
 * filter it does not belong to.
 */
function checkLevelTags(file, feature) {
  const inherited = feature.featureTags;

  return feature.scenarios.flatMap(({ title, tags }) => {
    const own = [...inherited, ...tags];
    const levels = LEVEL_TAGS.filter((wanted) =>
      own.some(({ tag }) => tag === wanted),
    );
    if (levels.length === 1) return [];

    const line = (tags[0] ?? inherited[0])?.line ?? 1;
    const found = levels.length === 0 ? 'none' : levels.join(' and ');

    return [
      `${file}:${line} — "${title}" carries ${found}; every local scenario needs exactly ` +
        `one of ${LEVEL_TAGS.join(' / ')}`,
    ];
  });
}

runIntegrityCheck({
  name: 'local-lane',
  workspace,
  config: CONFIG,
  featuresDir: 'features/local',
  expected: EXPECTED_LOCAL_SCENARIOS,
  expectedName: 'EXPECTED_LOCAL_SCENARIOS',
  checkTags: checkLevelTags,
});

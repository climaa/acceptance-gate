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
 * Scenarios, not Playwright tests: the six in `features/local/report.feature`,
 * which is the whole lane. This lane has one project, so the two numbers agree
 * today — they would stop agreeing the moment a second project is added, which
 * is why the count is of scenarios either way.
 *
 * It was 20 — 8 console, 6 report, 3 accessibility, 3 edge cases — until the
 * console, accessibility and edge-case requirements were withdrawn from this
 * lane in a hand-authored change. That is the only way this number may fall.
 *
 * Exact equality, not a floor, for the same reason the acceptance suite's is:
 * a floor decays into permission to delete. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a decision about what this lane
 * claims, and belongs in its own hand-authored change with the reason written
 * down.
 */
const EXPECTED_LOCAL_SCENARIOS = 6;

runIntegrityCheck({
  name: 'local-lane',
  workspace,
  config: CONFIG,
  featuresDir: 'features/local',
  expected: EXPECTED_LOCAL_SCENARIOS,
  expectedName: 'EXPECTED_LOCAL_SCENARIOS',
});

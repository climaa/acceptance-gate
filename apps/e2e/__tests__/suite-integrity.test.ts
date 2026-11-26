import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  type Lane,
  type ParsedFeature,
  parseFeature,
} from '../scripts/lib/suite-integrity-core.mjs';

// The script runs its check at import and exports nothing; what it owns is the
// lane it hands the shared core. Replacing `runIntegrityCheck` captures that lane
// instead of spawning bddgen and Playwright. `checkLaneCoverage` stays real,
// wrapped only so the test can read which lanes the script declares.
const { runIntegrityCheck, checkLaneCoverage } = vi.hoisted(() => ({
  runIntegrityCheck: vi.fn(),
  checkLaneCoverage: vi.fn(),
}));
vi.mock('../scripts/lib/suite-integrity-core.mjs', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../scripts/lib/suite-integrity-core.mjs')>();
  checkLaneCoverage.mockImplementation(actual.checkLaneCoverage);

  return { ...actual, runIntegrityCheck, checkLaneCoverage };
});

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let lane: Lane;
let runs: number;

/** The suite's project-tag rule, which the script defines and the core only calls. */
function checkTags(file: string, feature: ParsedFeature) {
  if (!lane.checkTags) throw new Error('the acceptance suite hands the core no tag rule');
  return lane.checkTags(file, feature);
}

function featureFiles() {
  const dir = join(WORKSPACE, lane.featuresDir);

  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.feature'))
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }));
}

/** What `--list` counts: one per Scenario, one per Examples row of a Scenario
 *  Outline. `parseFeature` sees an outline once, so it cannot answer this alone.
 *  Only rows inside an Examples block count; a step's data table is not one. */
function listedScenarios(text: string) {
  let total = 0;
  let rows: 'none' | 'header' | 'data' = 'none';

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('|')) {
      if (rows === 'header') rows = 'data';
      else if (rows === 'data') total += 1;
      continue;
    }

    rows = /^(Examples|Scenarios):/.test(line) ? 'header' : 'none';
    if (/^(Scenario|Example):/.test(line)) total += 1;
  }

  return total;
}

beforeAll(async () => {
  await import('../scripts/suite-integrity.mjs');
  // Read here: the calls belong to the import, not to any one test.
  runs = runIntegrityCheck.mock.calls.length;
  lane = runIntegrityCheck.mock.calls[0]?.[0] as Lane;
});

describe('the acceptance suite', () => {
  it('is checked once, against the default config and its own features directory', () => {
    // Arrange · Act — importing the script is the run.

    // Assert
    expect(runs).toBe(1);
    expect(lane).toMatchObject({
      name: 'acceptance-suite',
      workspace: WORKSPACE,
      featuresDir: 'features/acceptance',
      expected: 89,
      expectedName: 'EXPECTED_SCENARIOS',
    });
    expect(lane.config).toBeUndefined();
    expect(lane.serialFeatures).toBeUndefined();
  });

  it('expects exactly as many scenarios as features/acceptance lists', () => {
    // Arrange
    const files = featureFiles();

    // Act
    const scenarios = files.reduce((total, { text }) => total + listedScenarios(text), 0);

    // Assert
    expect(scenarios).toBe(lane.expected);
  });

  it('finds no scenario tagged out of both projects today', () => {
    // Arrange
    const files = featureFiles();

    // Act
    const failures = files.flatMap(({ name, text }) =>
      checkTags(`features/acceptance/${name}`, parseFeature(text)),
    );

    // Assert
    expect(failures).toEqual([]);
  });
});

describe('the lane-coverage check', () => {
  it('scans the whole features tree against both lanes', () => {
    // Arrange
    if (!lane.extraChecks)
      throw new Error('the acceptance suite hands the core no extra check');

    // Act
    lane.extraChecks();

    // Assert
    expect(checkLaneCoverage).toHaveBeenLastCalledWith(join(WORKSPACE, 'features'), [
      'acceptance',
      'local',
    ]);
  });

  it('finds every .feature file in a lane today', () => {
    // Arrange
    if (!lane.extraChecks)
      throw new Error('the acceptance suite hands the core no extra check');

    // Act
    const failures = lane.extraChecks();

    // Assert
    expect(failures).toEqual([]);
  });
});

describe('the @desktop + @mobile rule', () => {
  it('accepts a scenario with no project tag', () => {
    // Arrange
    const parsed = parseFeature('Feature: Blog\n  Scenario: Reads\n');

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });

  it('accepts a scenario confined to one project, wherever the tag sits', () => {
    // Arrange
    const parsed = parseFeature(
      '@desktop\nFeature: Blog\n  Scenario: Inherits\n\n  @desktop\n  Scenario: Repeats\n',
    );

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });

  it('accepts an empty feature', () => {
    // Arrange
    const parsed = parseFeature('@desktop @mobile\nFeature: Nothing yet\n');

    // Act
    const failures = checkTags('features/acceptance/empty.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });

  it('refuses a scenario carrying both tags itself, at its own tag line', () => {
    // Arrange
    const parsed = parseFeature(
      'Feature: Blog\n  Scenario: Kept\n\n  @slow-net @desktop @mobile\n  Scenario: Gone\n',
    );

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([
      'features/acceptance/blog.feature:4 — "Gone" is tagged @desktop and @mobile, so both projects exclude it',
    ]);
  });

  it('refuses a scenario whose own tag completes the Feature’s, at the scenario’s line', () => {
    // Arrange
    const parsed = parseFeature('@mobile\nFeature: Blog\n  @desktop\n  Scenario: Gone\n');

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([
      'features/acceptance/blog.feature:3 — "Gone" is tagged @desktop and @mobile, so both projects exclude it',
    ]);
  });

  it('refuses every scenario of a Feature carrying both, at the Feature’s tag line', () => {
    // Arrange
    const parsed = parseFeature(
      '\n@desktop @mobile\nFeature: Blog\n  Scenario: One\n  Scenario: Two\n',
    );

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([
      'features/acceptance/blog.feature:2 — "One" is tagged @desktop and @mobile, so both projects exclude it',
      'features/acceptance/blog.feature:2 — "Two" is tagged @desktop and @mobile, so both projects exclude it',
    ]);
  });

  it('matches the tags exactly, not by prefix or case', () => {
    // Arrange
    const parsed = parseFeature(
      'Feature: Blog\n  @Desktop @mobile-only\n  Scenario: Kept\n',
    );

    // Act
    const failures = checkTags('features/acceptance/blog.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });
});

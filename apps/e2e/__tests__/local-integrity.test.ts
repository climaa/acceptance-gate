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
// lane it hands the shared core. Replacing only `runIntegrityCheck` captures that
// lane instead of spawning bddgen and Playwright, and leaves `parseFeature` real
// so the tag rule is fed what the guard would actually parse.
const { runIntegrityCheck } = vi.hoisted(() => ({ runIntegrityCheck: vi.fn() }));
vi.mock('../scripts/lib/suite-integrity-core.mjs', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runIntegrityCheck,
}));

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let lane: Lane;
let runs: number;

/** The lane's tag rule, which the script defines and the core only calls. */
function checkTags(file: string, feature: ParsedFeature) {
  if (!lane.checkTags) throw new Error('the local lane hands the core no tag rule');
  return lane.checkTags(file, feature);
}

function feature(text: string) {
  return parseFeature(text);
}

beforeAll(async () => {
  await import('../scripts/local-integrity.mjs');
  // Read here: the shared preset clears mock calls before every test.
  runs = runIntegrityCheck.mock.calls.length;
  lane = runIntegrityCheck.mock.calls[0]?.[0] as Lane;
});

describe('the local lane', () => {
  it('is checked once, against its own config and features directory', () => {
    // Arrange · Act — importing the script is the run.

    // Assert
    expect(runs).toBe(1);
    expect(lane).toMatchObject({
      name: 'local-lane',
      workspace: WORKSPACE,
      config: 'playwright.local.config.ts',
      featuresDir: 'features/local',
      expected: 2,
      expectedName: 'EXPECTED_LOCAL_SCENARIOS',
      serialFeatures: [],
    });
  });

  it('expects exactly as many scenarios as features/local holds', () => {
    // Arrange
    const dir = join(WORKSPACE, lane.featuresDir);
    const files = readdirSync(dir).filter((name) => name.endsWith('.feature'));

    // Act
    const scenarios = files.reduce(
      (total, name) =>
        total + parseFeature(readFileSync(join(dir, name), 'utf8')).scenarios.length,
      0,
    );

    // Assert
    expect(scenarios).toBe(lane.expected);
  });

  it('finds nothing wrong with the tags the lane ships today', () => {
    // Arrange
    const dir = join(WORKSPACE, lane.featuresDir);
    const files = readdirSync(dir).filter((name) => name.endsWith('.feature'));

    // Act
    const failures = files.flatMap((name) =>
      checkTags(
        `features/local/${name}`,
        parseFeature(readFileSync(join(dir, name), 'utf8')),
      ),
    );

    // Assert
    expect(failures).toEqual([]);
  });
});

describe('the @mutating rule', () => {
  it('accepts the tag on a scenario of an allowlisted file', () => {
    // Arrange
    const parsed = feature('Feature: Flow\n  @mutating\n  Scenario: Writes\n');

    // Act
    const failures = checkTags('features/local/visual-diff-flow.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });

  it('accepts a file outside the allowlist that never writes', () => {
    // Arrange
    const parsed = feature('Feature: Console\n  Scenario: Reads\n');

    // Act
    const failures = checkTags('features/local/console.feature', parsed);

    // Assert
    expect(failures).toEqual([]);
  });

  it('refuses the tag on a Feature, with its line, even in an allowlisted file', () => {
    // Arrange
    const parsed = feature('@mutating\nFeature: Flow\n  Scenario: Writes\n');

    // Act
    const failures = checkTags('features/local/blog-content.feature', parsed);

    // Assert
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(
      /^features\/local\/blog-content\.feature:1 — @mutating on the Feature/,
    );
    expect(failures[0]).toContain('Put it on each scenario that writes.');
  });

  it('refuses a tagged scenario in a file the allowlist does not name', () => {
    // Arrange
    const parsed = feature(
      'Feature: Console\n  Scenario: Reads\n\n  @slow @mutating\n  Scenario: Deletes a set\n',
    );

    // Act
    const failures = checkTags('features/local/console.feature', parsed);

    // Assert
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(
      /^features\/local\/console\.feature:4 — "Deletes a set" carries @mutating/,
    );
    expect(failures[0]).toContain(
      'Only visual-diff-flow.feature, blog-content.feature may do that.',
    );
  });

  it('refuses both the Feature tag and the scenario tags outside the allowlist', () => {
    // Arrange
    const parsed = feature(
      '@mutating\nFeature: Console\n  @mutating\n  Scenario: One\n  @mutating\n  Scenario: Two\n',
    );

    // Act
    const failures = checkTags('features/local/console.feature', parsed);

    // Assert
    expect(failures).toHaveLength(3);
    expect(failures[0]).toMatch(
      /^features\/local\/console\.feature:1 — @mutating on the Feature/,
    );
    expect(failures[1]).toMatch(/:3 — "One" carries @mutating/);
    expect(failures[2]).toMatch(/:5 — "Two" carries @mutating/);
  });

  it('names an allowlisted file in which nothing carries the tag', () => {
    // Arrange
    const parsed = feature('Feature: Flow\n  Scenario: Stopped writing\n');

    // Act
    const failures = checkTags('features/local/visual-diff-flow.feature', parsed);

    // Assert
    expect(failures).toEqual([
      'features/local/visual-diff-flow.feature is named in MUTATING_FEATURES but no ' +
        'scenario carries @mutating — either tag the ones that write or drop it from the list',
    ]);
  });

  it('judges the file by its name alone, wherever it sits', () => {
    // Arrange
    const parsed = feature('Feature: Flow\n  Scenario: Stopped writing\n');

    // Act
    const failures = checkTags('elsewhere/deep/blog-content.feature', parsed);

    // Assert
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^elsewhere\/deep\/blog-content\.feature is named/);
  });
});

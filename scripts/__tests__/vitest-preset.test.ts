import { describe, expect, it } from 'vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

/** The coverage reporters a config ends up with once it extends the preset. */
function mergedReporters(reporter?: string[]): unknown {
  const config = defineConfig({ test: { coverage: reporter ? { reporter } : {} } });

  return mergeConfig(preset, config).test?.coverage?.reporter;
}

/**
 * The preset names the `json` coverage reporter so every suite leaves
 * `coverage/coverage-final.json`, the map the CRAP gate reads. That only holds
 * while merging joins the preset's list to a config's own, rather than one
 * replacing the other.
 */
describe('the preset coverage reporter', () => {
  it("joins a config's own reporters instead of replacing them", () => {
    // Arrange
    const own = ['text', 'text-summary'];

    // Act
    const reporters = mergedReporters(own);

    // Assert
    expect(reporters).toEqual(['json', 'text', 'text-summary']);
  });

  it('is the only reporter of a config that names none', () => {
    // Arrange: no `reporter` key, as packages/ui once had.

    // Act
    const reporters = mergedReporters();

    // Assert: vitest's default set no longer applies, so a config that wants
    // `text` on stdout has to name it.
    expect(reporters).toEqual(['json']);
  });
});

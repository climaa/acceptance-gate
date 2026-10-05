import { PROFILES } from '../sandcastle-agent-profiles.mts';
import { MODEL_ALIASES } from '../sandcastle-model-overrides.mts';

/**
 * What is being protected: the allowlist only validates OVERRIDES. A PROFILES
 * default goes to the CLI's `--model` flag unchecked, so a typo there (say
 * `claude-sonnet5-5`) would pass the typecheck and every resolver test, then
 * fail inside the last sandbox of a run — after the earlier roles have spent
 * their tokens. Importing PROFILES is safe here for the same reason as in
 * sandcastle.merge-branch-line.test.ts.
 */

describe('PROFILES', () => {
  it.each(Object.entries(PROFILES))(
    'pins %s to an allowlisted model',
    (_role, profile) => {
      // Arrange
      const allowlisted = Object.values(MODEL_ALIASES);

      // Act
      const isAllowlisted = allowlisted.includes(profile.model);

      // Assert
      expect(isAllowlisted).toBe(true);
    },
  );
});

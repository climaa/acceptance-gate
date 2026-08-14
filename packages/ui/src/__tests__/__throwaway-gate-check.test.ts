import { expect, it } from 'vitest';

// Throwaway — verifies the `main` ruleset actually blocks a red `gate` on a PR.
// Opened as part of the #232 runbook, never meant to merge.
it('deliberately fails to verify branch protection blocks a red gate', () => {
  expect(true).toBe(false);
});

import { describe, expect, it } from 'vitest';
import { targetAction } from '../lib/targets.ts';

describe('targetAction', () => {
  it.each([
    [
      '3 complex functions lack test coverage path, add tests before modifying',
      'add tests before modifying',
    ],
    [
      'Remove 5 unused exports to reduce surface area (100% dead)',
      'remove 5 unused exports',
    ],
    [
      'Changes with DashboardTemplate.tsx in 6 commits (50% coupling) without an import, make the dependency explicit or move the shared logic into one module',
      'make a hidden coupling explicit',
    ],
    [
      'Extract joinProblems (cognitive: 32) in 850-LOC file into smaller functions',
      'extract joinProblems in 850-LOC file into smaller functions',
    ],
    ['Break the cycle', 'break the cycle'],
  ])('reads %j as %j', (recommendation, action) => {
    const read = targetAction(recommendation);

    expect(read).toBe(action);
  });

  it('is empty without a recommendation', () => {
    const read = targetAction(undefined);

    expect(read).toBe('');
  });
});

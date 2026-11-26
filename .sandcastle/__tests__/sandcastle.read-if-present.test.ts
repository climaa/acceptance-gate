import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readIfPresent } from '../sandcastle-config.mts';

/**
 * sandcastle-config.mts calls readIfPresent at import time on the repo-root
 * `.env` and `.turbo/config.json`. Its `catch` ran only on machines where one
 * of those untracked files was missing, so the module's coverage count
 * depended on the machine, not on the tests. Calling it directly on a path
 * that cannot exist covers the catch everywhere.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sandcastle-read-if-present-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readIfPresent', () => {
  it('returns null for a file that does not exist', () => {
    const missing = path.join(dir, 'absent', '.env');

    const result = readIfPresent(missing);

    expect(result).toBeNull();
  });

  it('returns the text of a file that exists', () => {
    const file = path.join(dir, '.env');
    writeFileSync(file, 'TURBO_TEAM=team_x\n', 'utf8');

    const result = readIfPresent(file);

    expect(result).toBe('TURBO_TEAM=team_x\n');
  });
});

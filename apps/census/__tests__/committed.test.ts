import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateHistory, validateMeasurement } from '@/lib/validate.ts';

/**
 * The committed files are written only by `pnpm census:measure`, which validates
 * them first; this keeps a hand edit or a schema change from leaving them invalid.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));

describe('the committed measurement', () => {
  it('validates', () => {
    const problems = validateMeasurement(read('measurement.json'));

    expect(problems).toEqual([]);
  });

  it('has a history that validates', () => {
    const problems = validateHistory(read('history.json'));

    expect(problems).toEqual([]);
  });
});

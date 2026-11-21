import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateHistory, validateMeasurement } from '@/lib/validate.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');

/** A fresh, mutable copy of a committed fixture: each test breaks its own. */
function fixture(name: 'measurement' | 'history') {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
}

describe('validateMeasurement', () => {
  it('accepts the fixture: one workspace in every state and one gap of three kinds', () => {
    const measurement = fixture('measurement');

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([]);
  });

  it('refuses a file that is not a measurement at all', () => {
    const problems = validateMeasurement('not a measurement');

    expect(problems).not.toEqual([]);
  });

  it('refuses another schema version', () => {
    const measurement = { ...fixture('measurement'), schema: 2 };

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([expect.stringMatching(/^schema: /)]);
  });

  it('refuses a commit that is not 40 hex characters', () => {
    const measurement = { ...fixture('measurement'), commit: 'aebf7ec' };

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([expect.stringMatching(/^commit: /)]);
  });

  it('refuses a workspace missing a dimension key, naming the path', () => {
    const measurement = fixture('measurement');
    delete measurement.workspaces[0].dimensions.visual;

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      expect.stringMatching(/^workspaces\.0\.dimensions\.visual: /),
    ]);
  });

  it('refuses an unmeasured dimension with no reason', () => {
    const measurement = fixture('measurement');
    delete measurement.workspaces[1].dimensions.code.reason;

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      expect.stringMatching(/^workspaces\.1\.dimensions\.code\.reason: /),
    ]);
  });

  it('refuses more covered lines than there are', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.code.lines = {
      covered: 354,
      total: 353,
      pct: 100,
    };

    const problems = validateMeasurement(measurement);

    expect(problems).toContainEqual(
      expect.stringMatching(
        /^workspaces\.0\.dimensions\.code\.lines: covered 354 > total 353/,
      ),
    );
  });

  it('refuses a percentage that does not recompute from its counts', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.code.files[0].lines.pct = 90;

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      'workspaces.0.dimensions.code.files.0.lines.pct: 90, but 41/42 is 97.6',
    ]);
  });

  it('takes an empty file as fully covered, as the coverage summary does', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.code.files[0].lines = {
      covered: 0,
      total: 0,
      pct: 100,
    };

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([]);
  });

  it('refuses a percentage with more than one decimal', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.health.score = 79.31;

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      expect.stringMatching(/^workspaces\.0\.dimensions\.health\.score: /),
    ]);
  });

  it('refuses an absolute file path', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.code.files[0].path =
      '/repo/packages/ui/src/x.ts';

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      expect.stringMatching(/^workspaces\.0\.dimensions\.code\.files\.0\.path: /),
    ]);
  });

  it('refuses two gaps with the same id', () => {
    const measurement = fixture('measurement');
    measurement.gaps.push({ ...measurement.gaps[0] });

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      'gaps.3.id: duplicate of gaps.0 (unmeasured-workspace:apps/blog)',
    ]);
  });

  it('refuses a gap whose workspace is not in the measurement', () => {
    const measurement = fixture('measurement');
    measurement.gaps[0].workspace = '@gate/nowhere';

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual(['gaps.0.workspace: no workspace is named @gate/nowhere']);
  });

  it('refuses a Health gap: Health is shown, never a gap', () => {
    const measurement = fixture('measurement');
    measurement.gaps[0].dimension = 'health';

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([expect.stringMatching(/^gaps\.0\.dimension: /)]);
  });

  it('refuses an acceptance feature the feature map does not know', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[1].dimensions.acceptance.features.push('checkout');

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      'workspaces.1.dimensions.acceptance.features.6: checkout is not in the feature map',
    ]);
  });

  it('refuses a feature listed under an app it does not visit', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[1].dimensions.acceptance.features.push('visual-diff-shot');

    const problems = validateMeasurement(measurement);

    expect(problems).toEqual([
      'workspaces.1.dimensions.acceptance.features.6: visual-diff-shot visits apps/visual-diff-ui, not apps/blog',
    ]);
  });

  it('reports every fault in one pass, not only the first', () => {
    const measurement = fixture('measurement');
    measurement.workspaces[0].dimensions.code.files[0].lines.pct = 90;
    measurement.gaps[0].workspace = '@gate/nowhere';
    measurement.gaps.push({ ...measurement.gaps[1] });

    const problems = validateMeasurement(measurement);

    expect(problems).toHaveLength(3);
  });
});

describe('validateHistory', () => {
  it('accepts the fixture', () => {
    const history = fixture('history');

    const problems = validateHistory(history);

    expect(problems).toEqual([]);
  });

  it('accepts a null dimension: unmeasured at that commit', () => {
    const history = fixture('history');
    history.points[0].dimensions.code = null;

    const problems = validateHistory(history);

    expect(problems).toEqual([]);
  });

  it('refuses a point missing a dimension', () => {
    const history = fixture('history');
    delete history.points[1].dimensions.health;

    const problems = validateHistory(history);

    expect(problems).toEqual([expect.stringMatching(/^points\.1\.dimensions\.health: /)]);
  });

  it('refuses points out of order: oldest first', () => {
    const history = fixture('history');
    history.points.reverse();

    const problems = validateHistory(history);

    expect(problems).toEqual([
      'points.1.measuredAt: 2026-11-20T18:00:00.000Z is before points.0 (2026-11-21T18:30:00.000Z)',
    ]);
  });

  it('refuses two points for one commit: the same commit replaces its own point', () => {
    const history = fixture('history');
    history.points[1].commit = history.points[0].commit;

    const problems = validateHistory(history);

    expect(problems).toEqual([
      'points.1.commit: duplicate of points.0 (548f743baa441821dd411b40301bcdc28274a5ed)',
    ]);
  });
});

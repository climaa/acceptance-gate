import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_HOMES } from '../app/_screens/board-sample';
import {
  SAMPLE_COMPARISON_KEY,
  SAMPLE_LEDGER,
  SAMPLE_REPORT,
  SAMPLE_REPORT_ID,
  SAMPLE_VARIANTS,
} from '../app/_screens/report-sample';
import {
  SAMPLE_SET_LABEL,
  SAMPLE_SET_SHOTS,
  SAMPLE_SHOT,
  SAMPLE_SHOT_KEY,
  SAMPLE_SHOT_READINGS,
} from '../app/_screens/set-sample';
import { readBoardHomes } from '../lib/board-homes';
import { readComparison } from '../lib/comparison-meta';
import { readReport } from '../lib/data';
import { readLedgerReport } from '../lib/ledger';
import { readSetLedger } from '../lib/set-ledger';
import { readSetShots } from '../lib/set-shots';
import { shotProps } from '../lib/shot-props';

/**
 * The report, comparison, set and shot screens copy what a sample instance reads
 * off `fixtures/`, because a story cannot read a file. These cases hand the same
 * directory to the readers the routes call and hold each copy to their answer,
 * so a fixture edit fails here rather than leaving a screen's baseline quietly
 * different from the page it stands for. `dashboard-sample.test.ts` does the
 * same for `/`.
 */

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures');

beforeEach(() => {
  process.env.VISUAL_DIFF_DATA_DIR = FIXTURES;
});

afterEach(() => {
  delete process.env.VISUAL_DIFF_DATA_DIR;
});

describe('the report screens’ sample data', () => {
  it('is the report readReport returns', async () => {
    const report = await readReport(FIXTURES, SAMPLE_REPORT_ID);

    expect(SAMPLE_REPORT).toEqual(report);
  });

  it('walks the variants readComparison lists for its key', async () => {
    const comparison = await readComparison(
      FIXTURES,
      SAMPLE_REPORT_ID,
      SAMPLE_COMPARISON_KEY,
    );

    expect(SAMPLE_VARIANTS).toEqual(comparison?.variants);
  });

  it('carries the ledger report readLedgerReport finds for its key', async () => {
    const ledger = await readLedgerReport(SAMPLE_REPORT_ID, SAMPLE_COMPARISON_KEY);

    expect(ledger).not.toBeNull();
    expect(SAMPLE_LEDGER).toEqual(ledger);
  });
});

describe('the set screens’ sample data', () => {
  it('is the set readSetShots measures', async () => {
    const shots = await readSetShots(FIXTURES, null, SAMPLE_SET_LABEL);

    expect(SAMPLE_SET_SHOTS).toEqual(shots);
  });

  it('draws the shot the route would, from the set the route reads', async () => {
    const shots = await readSetShots(FIXTURES, null, SAMPLE_SET_LABEL);

    const props = shots && shotProps(SAMPLE_SET_LABEL, shots, SAMPLE_SHOT_KEY);

    expect(SAMPLE_SHOT).toEqual(props);
  });

  it('carries the readings readSetLedger finds for its shot', async () => {
    const readings = await readSetLedger(SAMPLE_SET_LABEL, SAMPLE_SHOT_KEY);

    expect(readings).not.toBeNull();
    expect(SAMPLE_SHOT_READINGS).toEqual(readings);
  });
});

describe('the board homes every screen is handed', () => {
  it('are the homes readBoardHomes folds off the tile maps', async () => {
    const homes = await readBoardHomes();

    expect(SAMPLE_HOMES).toEqual(homes);
  });
});

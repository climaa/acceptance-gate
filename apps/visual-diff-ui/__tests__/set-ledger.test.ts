import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readSetLedger } from '../lib/set-ledger';

/**
 * The read behind the shot view's readings: one screenshot's own sidecar.
 *
 * A BULKHEAD, as lib/ledger.ts is for a report: missing, unreadable or the
 * wrong shape costs the panel and nothing else, never a throw.
 */

const SET = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';

const temporaryDirs: string[] = [];

/** A data directory holding one set, with the shot's ledger written as `contents`. */
function seed(contents: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-set-ledger-'));
  temporaryDirs.push(dir);

  const set = path.join(dir, 'sets', SET);
  fs.mkdirSync(set, { recursive: true });
  if (contents !== null) fs.writeFileSync(path.join(set, `${KEY}.ledger.json`), contents);
  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

const LEDGER = JSON.stringify({
  schema: 1,
  key: KEY,
  origin: 'target',
  scale: { '--space-2': 8 },
  elements: [
    {
      path: 'ds-badge',
      label: 'ds-badge',
      rect: [0, 4, 41.48, 20.8],
      readings: [
        {
          property: 'padding-right',
          px: 8,
          authored: 'var(--space-2)',
          origin: 'regular',
          token: '--space-2',
          classification: 'token',
        },
      ],
    },
  ],
});

afterEach(() => {
  delete process.env.VISUAL_DIFF_DATA_DIR;
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readSetLedger', () => {
  it('reads every reading the screenshot’s capture measured', async () => {
    seed(LEDGER);

    const read = await readSetLedger(SET, KEY);

    expect({
      mode: read?.mode,
      properties: read?.rows.map((row) => row.property),
    }).toEqual({
      mode: 'every',
      properties: ['padding-right'],
    });
  });

  it('is null for a shot with no ledger beside it, without a word', async () => {
    seed(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readSetLedger(SET, KEY);

    expect({ read, warned: warn.mock.calls.length }).toEqual({ read: null, warned: 0 });
  });

  // The committed corpus never carries a ledger, so it is not even looked for.
  it('is null for the baselines without looking', async () => {
    seed(LEDGER);
    const read = await readSetLedger('baselines', KEY);

    expect(read).toBeNull();
  });

  it('is null for a key that names no variant, and so cannot climb', async () => {
    seed(LEDGER);

    const read = await readSetLedger(SET, '../../sets');

    expect(read).toBeNull();
  });

  it('is null for a set this instance does not have', async () => {
    seed(LEDGER);

    const read = await readSetLedger('../escape', KEY);

    expect(read).toBeNull();
  });

  it('names a file that will not parse and shows no readings', async () => {
    seed('{"schema": 2}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readSetLedger(SET, KEY);

    expect(read).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain(KEY);
  });

  it('names a file it could not read at all', async () => {
    const dir = seed(null);
    fs.mkdirSync(path.join(dir, 'sets', SET, `${KEY}.ledger.json`));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readSetLedger(SET, KEY);

    expect(read).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain(KEY);
  });
});

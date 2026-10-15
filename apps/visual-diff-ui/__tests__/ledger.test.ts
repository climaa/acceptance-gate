import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { readLedgerReport } from '../lib/ledger';

/**
 * The read behind the design view's readings panel.
 *
 * A BULKHEAD, the other end of the one the report writer puts around pairing
 * (lib/runner.ts): a sidecar that is missing, unreadable or not the shape it
 * claims costs its own panel and nothing else. Never a throw, because the
 * comparison it sits beside is already on screen — a reading is reference
 * beside a comparison, and a 500 would be a reading overruling one.
 */

const REPORT = 'set-a__set-b';
const KEY = 'organisms__desktop__light__organisms-dialog--open';

const temporaryDirs: string[] = [];

/** A data directory holding one report's ledger file, written as `contents`. */
function seed(contents: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-ledger-'));
  temporaryDirs.push(dir);

  const ledger = path.join(dir, 'reports', REPORT, 'ledger');
  fs.mkdirSync(ledger, { recursive: true });
  if (contents !== null) fs.writeFileSync(path.join(ledger, `${KEY}.json`), contents);
  process.env.VISUAL_DIFF_DATA_DIR = dir;

  return dir;
}

const report = (changes: unknown[]) =>
  JSON.stringify({ schema: 1, key: KEY, mode: 'changed', origin: 'target', changes });

const CHANGE = {
  label: 'button "Keep it open"',
  property: 'padding-right',
  change: 'changed',
  before: { px: 16, token: '--space-4', origin: 'regular', classification: 'token' },
  after: { px: 6, token: '--space-1', origin: 'user-agent', classification: 'off-scale' },
  rect: [280.27, 462.91, 106.19, 30],
};

afterEach(() => {
  delete process.env.VISUAL_DIFF_DATA_DIR;
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readLedgerReport', () => {
  it('reads what the spacing did on one variant', async () => {
    seed(report([CHANGE]));

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toEqual({
      schema: 1,
      key: KEY,
      mode: 'changed',
      origin: 'target',
      changes: [CHANGE],
    });
  });

  // Every compare against `baselines` is this: the corpus is committed rather
  // than captured, so it carries no sidecars and the pairing has one side.
  it('reads a report the pairing could only read one side of', async () => {
    seed(
      JSON.stringify({
        schema: 1,
        key: KEY,
        mode: 'after-only',
        origin: 'document',
        changes: [{ ...CHANGE, change: 'present', before: null }],
      }),
    );

    const read = await readLedgerReport(REPORT, KEY);

    expect(read?.mode).toBe('after-only');
  });

  it('is null for a comparison with no ledger file, without a word', async () => {
    seed(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('is null for a report this instance does not have', async () => {
    seed(report([CHANGE]));

    const read = await readLedgerReport('nothing__here', KEY);

    expect(read).toBeNull();
  });

  it('is null for a key that would climb out of the report', async () => {
    seed(report([CHANGE]));

    const read = await readLedgerReport(REPORT, '../../summary');

    expect(read).toBeNull();
  });

  // Absent is ordinary; there and unreadable is the disk saying something, and
  // the panel's absence alone would not pass that on.
  it('names a file it could not read at all', async () => {
    const dir = seed(null);
    fs.mkdirSync(path.join(dir, 'reports', REPORT, 'ledger', `${KEY}.json`));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain(KEY);
  });

  it('names a file that will not parse and shows no panel', async () => {
    seed('not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain(KEY);
  });

  // The producer changing shape is the failure this parse exists to land here,
  // at the read, rather than three renders deep in the panel.
  it('names a file that is not the shape it claims and shows no panel', async () => {
    seed(report([{ ...CHANGE, after: { px: 6 } }]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toBeNull();
    expect(warn.mock.calls.flat().join(' ')).toContain(KEY);
  });

  it('refuses a schema this app was not written against', async () => {
    seed(
      JSON.stringify({
        schema: 2,
        key: KEY,
        mode: 'changed',
        origin: 'target',
        changes: [],
      }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const read = await readLedgerReport(REPORT, KEY);

    expect(read).toBeNull();
  });
});

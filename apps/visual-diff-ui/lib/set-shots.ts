import * as fs from 'node:fs';
import * as path from 'node:path';
import { cacheLife, cacheTag } from 'next/cache';
import { pngSize } from '@gate/visual-diff/capture';
import { LEDGER, parseVariantKey } from '@gate/visual-diff/policy';
import { BASELINE_ENV, CANONICAL_LABEL, setShotsDir } from './baselines';
import {
  type SetShot,
  type SetShots,
  type ShotCell,
  groupShots,
  parseShotName,
} from './set-view';
import { SETS_TAG } from './tags';

/**
 * One screenshot set, read off the disk. What the filenames say, and the
 * grouping and filter counts built on them, are `lib/set-view.ts`.
 *
 * This is NOT `lib/runner.ts`'s `readSet`. That one reads every shot's BYTES,
 * because a comparison needs pixels; a page needs a ratio, which is twenty-four
 * bytes of PNG header. Reading 1.7 MB to learn 160 pairs of integers would be
 * the same work for none of the answer.
 */

/** Signature, chunk length, `IHDR`, then two big-endian uint32s — everything
 *  `pngSize` reads, and nothing after it. */
const HEADER_BYTES = 24;

/** What only the file itself can say. */
interface ShotSize {
  bytes: number;
  width: number | null;
  height: number | null;
}

/** Whether a filename is the token ledger a capture wrote beside one of its shots.
 *  A ledger is no cell of the grid, and no stray file either. */
function isLedgerFile(name: string): boolean {
  return (
    name.endsWith(LEDGER.fileSuffix) &&
    parseVariantKey(name.slice(0, -LEDGER.fileSuffix.length)) !== null
  );
}

/**
 * A shot's pixel dimensions, or nulls for a file that is there and will not say.
 *
 * A truncated capture, a half-written file, something that is not a regular file
 * at all: the shot still EXISTS, so it is still shown, with the caption stating
 * no size. Reporting it as absent would be the failure `ignored` exists to
 * prevent one level up — a screenshot that is on disk must never read as a story
 * that went missing.
 */
async function headerSize(file: string): Promise<Omit<ShotSize, 'bytes'>> {
  let handle: fs.promises.FileHandle | undefined;

  try {
    handle = await fs.promises.open(file, 'r');
    const header = new Uint8Array(HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
    const size = bytesRead === HEADER_BYTES ? pngSize(header) : null;

    return { width: size?.width ?? null, height: size?.height ?? null };
  } catch {
    return { width: null, height: null };
  } finally {
    await handle?.close();
  }
}

/**
 * One shot's size on disk and in pixels, or null when there is no file to
 * measure.
 *
 * The two failures are deliberately not the same. `stat` failing means the file
 * went away between the listing and the read, and dropping it is right: there is
 * no screenshot to show. Everything after that is a file that IS there, and is
 * shown — see `headerSize`. Collapsing both into one `catch` is what made an
 * unreadable shot vanish from the page AND from the counts, silently.
 */
async function measure(dir: string, name: string): Promise<ShotSize | null> {
  const file = path.join(dir, name);

  let bytes: number;
  try {
    bytes = (await fs.promises.stat(file)).size;
  } catch {
    return null;
  }

  return { bytes, ...(await headerSize(file)) };
}

/** The corpus's host stamp, or null where there is none to read. A capture set
 *  writes no such file, and a missing file is not an error — see lib/data.ts. */
async function readEnv(dir: string): Promise<Record<string, string> | null> {
  try {
    const raw = await fs.promises.readFile(path.join(dir, BASELINE_ENV), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
        key,
        String(value),
      ]),
    );
  } catch {
    return null;
  }
}

/**
 * One set's screenshots, or null when there is no such set here.
 *
 * `dataDir` and `root` are both arguments so they join the `use cache` key — the
 * rule every reader in lib/data.ts and lib/baselines.ts keeps. Null covers a
 * label that is not one, a label with no directory, and a corpus with no
 * checkout, and the page tells those apart by asking `readCanonicalSet`, not by
 * asking this.
 */
export async function readSetShots(
  dataDir: string,
  root: string | null,
  label: string,
): Promise<SetShots | null> {
  'use cache';
  cacheLife('seconds');
  cacheTag(SETS_TAG);

  const dir = setShotsDir(dataDir, root, label);
  if (!dir) return null;

  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return null;
  }

  const ignored: string[] = [];
  const parsed: ShotCell[] = [];
  for (const name of names) {
    if (name === BASELINE_ENV || isLedgerFile(name)) continue;

    const cell = parseShotName(name);
    if (cell) parsed.push(cell);
    else ignored.push(name);
  }

  const measured = await Promise.all(parsed.map((cell) => measure(dir, cell.file)));
  const shots: SetShot[] = parsed.flatMap((cell, at) => {
    const size = measured[at];

    return size ? [{ ...cell, ...size }] : [];
  });
  if (shots.length === 0) return null;

  return {
    label,
    isCanonical: label === CANONICAL_LABEL,
    sections: groupShots(shots),
    shots: shots.length,
    bytes: shots.reduce((total, shot) => total + shot.bytes, 0),
    ignored,
    env: await readEnv(dir),
  };
}

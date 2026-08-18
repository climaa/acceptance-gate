import * as fs from 'node:fs';
import * as path from 'node:path';
import { lastCommit, repoRoot } from './git';

/**
 * The committed baseline corpus, offered as something to compare against.
 *
 * `packages/visual-diff/__baselines__` is what CI compares every pull request
 * against, and it is laid out exactly like a capture set — `<variantKey>.png`,
 * one per cell of the matrix. So a reviewer who has just captured can compare
 * against the corpus itself rather than against yesterday's capture, which is the
 * question a daily run is actually asking.
 *
 * It is NOT a capture set, and this module keeps the two apart on purpose:
 *
 *  - it lives in the CHECKOUT, not in the data directory, so no instance owns it;
 *  - this console never writes it. `accept` promotes into `<dataDir>/__baselines__`
 *    (D3), and the committed corpus is changed by a commit — which is why the
 *    console offers no way to delete it and refuses if asked anyway;
 *  - its provenance is a commit rather than a branch and a working tree.
 *
 * An instance with no checkout behind it — a deployment — has no corpus to offer,
 * and says nothing rather than inventing one.
 */

/**
 * The label the corpus answers to.
 *
 * Legal under `SetLabelSchema` (`/^[A-Za-z0-9][A-Za-z0-9.-]*$/`, which is why it
 * is not the directory's own `__baselines__`) so the compare pickers and
 * `POST /api/jobs` need no special case to name it. Reserved rather than merely
 * conventional: `freeLabel` treats it as taken, so a capture called `baselines`
 * becomes `baselines-2` instead of shadowing the corpus in the pickers.
 */
export const CANONICAL_LABEL = 'baselines';

/** Repo-root-relative, and the same path `policy.PATHS.baselines` names — that
 *  constant is not exported through this app's declarations, and a second
 *  spelling of it is a drift waiting to happen, so the suite pins them together. */
const BASELINES = path.join('packages', 'visual-diff', '__baselines__');

/** The stamp the corpus carries beside its shots. Not a shot, so not counted as
 *  one — and skipped by name where the shots are read. */
export const BASELINE_ENV = 'BASELINE_ENV.json';

export const baselinesPath = (root: string): string => path.join(root, BASELINES);

export interface CanonicalSet {
  label: string;
  /** The commit that last accepted the corpus, short. */
  sha: string | null;
  /** That commit's date, `YYYY-MM-DD`, or null when git could not say. */
  acceptedAt: string | null;
  /** How many shots are in it. */
  stories: number;
  /** Bytes on disk, for the same column the capture sets show a size in. */
  bytes: number;
}

const PNG = '.png';

/**
 * The corpus as a row, or null when there is none to read.
 *
 * Null covers three cases and deliberately does not distinguish them, because
 * the answer on screen is the same for all: no checkout (a deployment), no
 * `__baselines__` directory, or a directory holding no shots. Any of them is a
 * console with nothing canonical to compare against.
 */
export function readCanonicalSet(root: string | null = repoRoot()): CanonicalSet | null {
  if (!root) return null;

  const dir = baselinesPath(root);

  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }

  const shots = names.filter((name) => name.endsWith(PNG));
  if (shots.length === 0) return null;

  const bytes = shots.reduce(
    (total, name) => total + fs.statSync(path.join(dir, name)).size,
    0,
  );
  const commit = lastCommit(root, BASELINES);

  return {
    label: CANONICAL_LABEL,
    sha: commit?.sha ?? null,
    acceptedAt: commit?.date ?? null,
    stories: shots.length,
    bytes,
  };
}

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Which directory this instance reads, and nothing else.
 *
 * Split out of lib/data.ts so that `proxy.ts` can ask the same question without
 * importing the readers — that file runs before the App Router does, and the
 * readers pull in `next/cache` and `next/server` to do work that has no meaning
 * there. The answer has to be the same answer, though: a proxy that resolved
 * the directory its own way would refuse reports the page can read, or admit
 * ones it cannot, the first time the two drifted.
 *
 * Everything here is synchronous and request-agnostic on purpose. What makes
 * the resolution per-request is `connection()`, and that stays next door with
 * `resolveDataDir` — see lib/data.ts for why it must not be baked into a
 * prerender.
 */

/** The committed sample tree, served when nothing else is configured. */
export const FIXTURES_DIR = path.join(process.cwd(), 'fixtures');

/** The one variable this app reads to find real data, named as a type so a
 *  caller — and every test — can hand over exactly what the resolution reads. */
export interface DataDirEnv {
  VISUAL_DIFF_DATA_DIR?: string;
  // `process.env` is the production argument; the index signature is what lets
  // it be passed without a cast.
  [variable: string]: string | undefined;
}

export interface DataSource {
  dir: string;
  /**
   * The single authority on whether a screen is showing sample data: this
   * resolution, never a file's own `isSample` field. The committed fixture
   * carries that field as provenance and the schemas accept it, but deriving
   * the badge from both would let a screen disagree with its own API response.
   */
  isSample: boolean;
}

/** A directory that exists and holds something. Anything else is "no data here". */
function isPopulated(dir: string): boolean {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** The resolution itself, with no opinion about when it runs. */
export function dataDirFrom(env: DataDirEnv = process.env): DataSource {
  const configured = env.VISUAL_DIFF_DATA_DIR?.trim();
  if (!configured || !isPopulated(configured)) {
    return { dir: FIXTURES_DIR, isSample: true };
  }

  return { dir: path.resolve(configured), isSample: false };
}

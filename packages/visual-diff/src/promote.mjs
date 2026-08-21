// @ts-check
//
// Promote a report's candidates into a baseline corpus (D3).
//
// NOT `accept`, which captures. The shots being promoted were taken in the pinned
// container and already live in the report; this copies them and restamps the corpus.
// It is all-or-nothing: every refusal happens before the first write, and every byte is
// in memory before any of them lands.
//
// It lives in this package rather than in the console because of WHERE it has to run.
// The stamp it writes describes the machine that wrote it, so a promote on a developer's
// laptop marks a linux corpus `darwin` — which the next `check` refuses, loudly, but only
// after a reviewer thought the baselines were accepted. The console's answer used to be a
// `docker run` printed for a human to paste; now the console runs that container itself
// (apps/visual-diff-ui/lib/runner.ts) and this is what it runs inside it.
//
// EVERY PATH IS AN ARGUMENT, with no default anywhere. `commands.mjs` derives its root
// from `import.meta.url`, so a bare `node cli.mjs` reads and writes the real
// `packages/visual-diff/__baselines__`. A promote that fell back to that would rewrite
// the committed corpus when it meant to write a data directory, which is the one mistake
// this file must be incapable of making. Omitting `--data-dir` is a usage error.

import * as fs from 'node:fs';
import * as path from 'node:path';

import { BASELINE_ENV, EXIT, assertWithinBudget } from './policy.mjs';
import { probeHost } from './commands.mjs';

/** @typedef {import('./commands.mjs').CommandResult} CommandResult */

const PNG = '.png';

/** The corpus a promote writes into, under the data directory it was handed — never the
 *  checkout's committed one. */
export const baselinesDirOf = (dataDir) => path.join(dataDir, '__baselines__');

/** @param {string} message @returns {CommandResult} */
const refuse = (message) => ({ exitCode: EXIT.broken, message });

/** @param {unknown} cause */
const isMissing = (cause) =>
  /** @type {NodeJS.ErrnoException} */ (cause).code === 'ENOENT';

/**
 * One report's `summary.json`, in the shape this file reads it.
 *
 * Validated rather than trusted: this is the record a promote decides on, and a summary
 * missing `counts.a11y` would otherwise read as zero — an accessibility failure
 * baselined away by a typo in a file nobody looked at.
 * @param {string} file
 */
function readSummary(file) {
  const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
  const a11y = summary?.counts?.a11y;
  const variants = summary?.variants;

  if (typeof a11y !== 'number' || !Array.isArray(variants)) {
    throw new Error(`${file} is not a report summary this can promote from`);
  }

  return { a11y, variants };
}

/**
 * Every candidate shot the report has to promote, read before a byte is written.
 *
 * A `removed` variant has no candidate by definition — it is a baseline this run did not
 * reproduce — and D2 forbids deleting it as a side effect of an accept, so it is left
 * exactly where it is. An `errored` one has no candidate either, and that DOES take the
 * whole promote down: the alternative is a corpus silently one story short, whose next
 * comparison reports that story as `removed` with nothing to say why.
 * @param {string} shots @param {{key: string, bucket: string}[]} variants
 */
function candidateShots(shots, variants) {
  return new Map(
    variants
      .filter((variant) => variant.bucket !== 'removed')
      .map((variant) => {
        const file = path.join(shots, `${variant.key}.candidate${PNG}`);
        try {
          return [variant.key, fs.readFileSync(file)];
        } catch {
          throw new Error(
            `${variant.key} has no candidate shot to promote — nothing was written`,
          );
        }
      }),
  );
}

/** The bytes already in the corpus that this promotion does not replace.
 *  @param {string} dir @param {Set<string>} promoted */
function retainedBytes(dir, promoted) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return 0;
  }

  return names
    .filter((name) => name.endsWith(PNG) && !promoted.has(name.slice(0, -PNG.length)))
    .reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0);
}

/**
 * @param {undefined} _deps
 * @param {{ dataDir?: string, reportId?: string, host?: () => Promise<Record<string, string>> }} [opts]
 * @returns {Promise<CommandResult>}
 */
export async function promote(_deps, opts = {}) {
  const { dataDir, reportId, host = probeHost } = opts;
  if (!dataDir) return refuse('promote needs --data-dir');
  if (!reportId) return refuse('promote needs --report');

  const reports = path.join(dataDir, 'reports', reportId);

  const file = path.join(reports, 'summary.json');
  let summary;
  try {
    summary = readSummary(file);
  } catch (cause) {
    // Named by the id the caller asked for, not by the absolute path this resolved to:
    // inside the container that path is `/data/...`, which names nothing a reviewer
    // reading the log has on their disk. A summary that is there but unreadable says so
    // in its own words (see `readSummary`) and keeps them.
    const why = cause instanceof Error && !isMissing(cause) ? `: ${cause.message}` : '';

    return refuse(`no report at reports/${reportId} to promote${why}`);
  }

  if (summary.a11y > 0) {
    return refuse(
      `this report carries ${summary.a11y} accessibility failure(s) — an accessibility failure is never acceptable as a baseline, so nothing was written`,
    );
  }

  const dir = baselinesDirOf(dataDir);
  let shots;
  try {
    shots = candidateShots(path.join(reports, 'shots'), summary.variants);
    assertWithinBudget(shots, retainedBytes(dir, new Set(shots.keys())));
  } catch (cause) {
    // Every one of these is "nothing was written", and the message says which: a missing
    // shot and a blown budget are refusals a reviewer acts on, not crashes. Deliberately
    // scoped to the reads and the budget — a failure once the writes have begun is not a
    // refusal and must not read as one.
    return refuse(cause instanceof Error ? cause.message : String(cause));
  }

  // The stamp is probed, not asserted: it describes the machine that actually wrote these
  // bytes. Run this anywhere but the pinned image and it says so, and the next `check`
  // refuses on the mismatch rather than comparing against a corpus from another OS.
  const fingerprint = await host();

  fs.mkdirSync(dir, { recursive: true });
  for (const [key, bytes] of shots) {
    fs.writeFileSync(path.join(dir, `${key}${PNG}`), bytes);
  }
  fs.writeFileSync(
    path.join(dir, BASELINE_ENV),
    `${JSON.stringify(fingerprint, null, 2)}\n`,
  );

  return {
    exitCode: EXIT.ok,
    message: `promoted ${shots.size} baseline(s) and restamped ${BASELINE_ENV}`,
  };
}

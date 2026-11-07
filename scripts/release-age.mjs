// @ts-check
//
// pnpm-workspace.yaml holds dependencies back until they are three days old:
// `minimumReleaseAge` is written there and is at least 4320 minutes. It is
// promoted from a child project.
//
// pnpm 11 applies a release-age floor by default, but at 1440 minutes (one
// day), and this repository wrote no value, so it got one day without anyone
// deciding that. Three days is the supply-chain margin asked for: a hijacked
// release is usually caught and pulled within that window, and an install that
// refuses it in the meantime costs only a wait. The default is not that, and a
// key deleted or lowered would fall back to it silently, hence the tripwire.
//
// The cost, which is why the floor is worth stating: every dependency bump must
// name a version at least three days old, and a Dependabot PR for yesterday's
// release fails `pnpm install` until it ages. Lowering the key is the wrong fix.
//
//   node scripts/release-age.mjs           the repository's pnpm-workspace.yaml
//   node scripts/release-age.mjs <file>    this file, for checking a copy
//
// Exit 0: the key is written and at or above the floor. 1: missing, not a
// number, or below it. 2: the file could not be read.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Three days, in the minutes pnpm counts in. */
export const MIN_RELEASE_AGE = 4320;

/** A top-level `minimumReleaseAge:` line, its value up to a trailing comment.
 *  Top-level only: the same word nested under another key is not pnpm's
 *  setting. */
const KEY_LINE = /^minimumReleaseAge\s*:(.*)$/;

/** A plain decimal integer of minutes, nothing pnpm would read otherwise. */
const MINUTES = /^\d+$/;

/**
 * Why `text`, a pnpm-workspace.yaml, does not hold the floor; null when it does.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function releaseAgeProblem(text) {
  const values = text.split(/\r?\n/).flatMap((line) => {
    const match = KEY_LINE.exec(line);
    return match === null ? [] : [match[1].replace(/\s+#.*$/, '').trim()];
  });

  if (values.length === 0)
    return `no minimumReleaseAge (pnpm falls back to 1440, one day)`;
  if (values.length > 1) return `minimumReleaseAge is written ${values.length} times`;

  const value = values[0].replace(/^(['"])(.*)\1$/, '$2');
  if (!MINUTES.test(value))
    return `minimumReleaseAge is not a number of minutes: ${values[0]}`;

  const minutes = Number(value);
  if (minutes < MIN_RELEASE_AGE) {
    return `minimumReleaseAge is ${minutes}, below the floor of ${MIN_RELEASE_AGE} (three days)`;
  }

  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = resolve(process.argv[2] ?? `${ROOT}/pnpm-workspace.yaml`);

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.error(`release-age: cannot read ${file}`);
    process.exit(2);
  }

  const problem = releaseAgeProblem(text);
  if (problem !== null) {
    console.error(`release-age: ${problem}, in ${file}`);
    process.exit(1);
  }

  console.log(`release-age: minimumReleaseAge holds at least ${MIN_RELEASE_AGE} minutes`);
}

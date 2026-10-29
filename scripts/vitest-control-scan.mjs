// @ts-check
//
// The unit tests carry no Vitest control vocabulary: the rule the Gherkin lanes
// enforce for `@skip`, `@only` and friends, applied to `describe`, `it`, `test`
// and `bench`. It is promoted from a child project.
//
// A `.skip` or `.todo` is collected, counted and never run, and the suite stays
// green; a `.only` narrows the run to one test and still exits 0. `skipIf` and
// `runIf` are the same skip with a condition, and modifiers chain on either side
// (`it.only.each`, `describe.concurrent.skip`). None of those is a finding
// anything downstream would notice, so this is the tripwire.
//
// A scan that read nothing is refused, not passed: every `SCANNED_DIRS` entry
// must hold at least one test file, so a moved directory turns this red rather
// than silently switching it off.
//
// The one documented escape is a `// reason:` comment on the same line, or a
// comment line that is only that, directly above the call. The line above is
// there because Prettier moves a trailing comment off a call it wraps, so a
// same-line rule alone would fight the formatter. The escape does not make the
// skip silent: the call is still printed, so whoever reads the
// gate's output sees what is not running and why. It only stops the exit code.
//
//   node scripts/vitest-control-scan.mjs              every scanned test file
//   node scripts/vitest-control-scan.mjs <file>...    these files, for checking a copy
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every directory whose tests the gate runs: each workspace's unit tests
 * (`turbo run test`) and the repo plumbing's (`vitest.sandcastle.config.mts`).
 * A `*` is one workspace directory. `apps/e2e` is not here: its lanes are
 * Gherkin, and their tag checks already refuse the same vocabulary.
 */
export const SCANNED_DIRS = [
  'apps/*/__tests__',
  'packages/*/src',
  'scripts/__tests__',
  '.sandcastle/__tests__',
];

/** `foo.test.ts`, `foo.test.tsx`, `foo.test.mjs`: the suffixes in use here. */
const TEST_FILE = /\.test\.(ts|tsx|mts|mjs)$/;

/** `it.skip(`, `describe.only (`, `it.only.each(`, `test.skipIf(` … at the start
 *  of a line, where a Vitest call sits. Anchored so the same text inside a string
 *  or a comment is not a finding; a control call hidden mid-line is a shape
 *  nobody writes. `describe.each(` alone is not a control call. */
const CONTROL_CALL =
  /^\s*(describe|it|test|bench)(?:\.\w+)*?\.(skip|todo|only|skipIf|runIf)\s*[.(]/;

/** The escape: a comment on the call's line that gives the reason… */
const REASON = /\/\/\s*reason:/;

/** …or a line directly above that is nothing but that comment. */
const REASON_LINE = /^\s*\/\/\s*reason:/;

/**
 * Every control call in `text`, with its line and whether the line documents it.
 *
 * @param {string} text  A test file.
 * @returns {{ line: number, call: string, documented: boolean }[]}
 */
export function controlCalls(text) {
  const lines = text.split('\n');

  return lines.flatMap((line, index) => {
    const match = CONTROL_CALL.exec(line);
    if (match === null) return [];

    const documented = REASON.test(line) || REASON_LINE.test(lines[index - 1] ?? '');

    return [{ line: index + 1, call: `${match[1]}.${match[2]}`, documented }];
  });
}

/** The directories one `SCANNED_DIRS` entry names; none when absent.
 *  @param {string} root @param {string} pattern @returns {string[]} */
function expand(root, pattern) {
  const [parent, star, ...rest] = pattern.split('/');
  if (star !== '*') return [join(root, pattern)];

  try {
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, parent, entry.name, ...rest));
  } catch {
    return [];
  }
}

/** Every test file under `dir`, recursively, never descending into a
 *  `node_modules`; none when the directory is absent.
 *  @param {string} dir @returns {string[]} */
function testFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(path);

    return TEST_FILE.test(entry.name) ? [path] : [];
  });
}

/**
 * Every test file the scan reads under `root`, and the `SCANNED_DIRS` entries
 * that matched none: those make the scan blind, so the CLI refuses them.
 *
 * @param {string} [root]
 * @returns {{ files: string[], empty: string[] }}
 */
export function scannedFiles(root = ROOT) {
  const byPattern = SCANNED_DIRS.map((pattern) => ({
    pattern,
    files: expand(root, pattern).flatMap(testFiles),
  }));

  return {
    files: byPattern.flatMap(({ files }) => files),
    empty: byPattern
      .filter(({ files }) => files.length === 0)
      .map(({ pattern }) => pattern),
  };
}

/** The file arguments, or every scanned file; exits 2 on a blind scan.
 *  @returns {string[]} */
function filesToScan() {
  if (process.argv.length > 2) return process.argv.slice(2).map((file) => resolve(file));

  const { files, empty } = scannedFiles();
  if (empty.length > 0) {
    console.error(
      `vitest-control-scan: no test file under ${empty.join(', ')}. A scan that reads ` +
        `nothing proves nothing; fix SCANNED_DIRS in scripts/vitest-control-scan.mjs`,
    );
    process.exit(2);
  }

  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = filesToScan();

  const findings = files.flatMap((file) =>
    controlCalls(readFileSync(file, 'utf8')).map((call) => ({
      ...call,
      file: relative(ROOT, file),
    })),
  );

  for (const { file, line, call, documented } of findings) {
    const note = documented ? 'documented with a reason, not running' : 'no reason given';
    console.error(`  ${file}:${line} — ${call}( — ${note}`);
  }

  const undocumented = findings.filter((finding) => !finding.documented);

  if (undocumented.length > 0) {
    console.error(
      `vitest-control-scan: ${undocumented.length} control call(s) without a reason in the unit tests`,
    );
    process.exit(1);
  }

  console.log(
    `vitest-control-scan: ${files.length} test file(s), ${findings.length} control call(s), all documented`,
  );
}

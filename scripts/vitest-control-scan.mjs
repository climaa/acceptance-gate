// @ts-check
//
// The unit tests carry no Vitest control vocabulary: the rule the Gherkin lanes
// enforce for `@skip`, `@only` and friends, applied to `describe`, `it`, `test`
// `bench` and `suite`. It is promoted from a child project.
//
// A `.skip` or `.todo` is collected, counted and never run, and the suite stays
// green; a `.only` narrows the run to one test and still exits 0. `skipIf` and
// `runIf` are the same skip with a condition, and modifiers chain on either side
// (`it.only.each`, `describe.concurrent.skip`). None of those is a finding
// anything downstream would notice, so this is the tripwire.
//
// A scan that read nothing is refused, not passed: every `SCANNED_DIRS` entry
// must hold at least one test file, and so must each workspace a `*` matches
// that has a `vitest.config.*`. A workspace that moves its tests elsewhere turns
// this red rather than silently dropping out of the scan.
//
// The one documented escape is a `// reason: <text>` comment on the same line, or a
// comment line that is only that, directly above the call. The line above is
// there because Prettier moves a trailing comment off a call it wraps, so a
// same-line rule alone would fight the formatter. The escape does not make the
// skip silent: the call is still printed, so whoever reads the
// gate's output sees what is not running and why. It only stops the exit code.
//
//   node scripts/vitest-control-scan.mjs              every scanned test file
//   node scripts/vitest-control-scan.mjs <file>...    these files, for checking a copy
//
// Exit 0: every control call documented. 1: one without a reason. 2: the scan
// could not judge (blind, or a named file unreadable).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 *  of a line, where a Vitest call sits. Anchored so the same text mid-line, in a
 *  one-line string or after `//` is not a finding; a control call hidden mid-line
 *  is a shape nobody writes. A line inside a template literal or a `/* *\/` block
 *  that starts with one is still a finding: the scan reads lines, not syntax, and
 *  errs towards blocking. `describe.each(` alone is not a control call. */
const CONTROL_CALL =
  /^\s*(describe|it|test|bench|suite)(?:\.\w+)*?\.(skip|todo|only|skipIf|runIf)\s*[.(]/;

/** The escape: a comment on the call's line that gives a reason, not an empty
 *  `reason:`… */
const REASON = /\/\/\s*reason:\s*\S/;

/** …or a line directly above that is nothing but that comment. A reason that
 *  runs over several `//` lines starts with the `reason:` line, so that one sits
 *  directly above the call. */
const REASON_LINE = /^\s*\/\/\s*reason:\s*\S/;

/** What a documented call does to the run, for the line the gate prints. */
const EFFECT = {
  skip: 'not running',
  todo: 'not running',
  only: 'narrowing the run to itself',
  skipIf: 'running only when its condition allows',
  runIf: 'running only when its condition allows',
};

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

/** A workspace Vitest runs: it carries its own config. */
const VITEST_CONFIG = /^vitest\.config\.[cm]?[jt]s$/;

/** @param {string} dir @returns {boolean} */
function hasVitestConfig(dir) {
  try {
    return readdirSync(dir).some((name) => VITEST_CONFIG.test(name));
  } catch {
    return false;
  }
}

/**
 * The directories one `SCANNED_DIRS` entry names; none when absent. `required`
 * marks the ones that must hold a test file on their own: a plain entry, and a
 * `*` workspace with a Vitest config.
 *
 * @param {string} root @param {string} pattern
 * @returns {{ label: string, dir: string, required: boolean }[]}
 */
function expand(root, pattern) {
  const [parent, star, ...rest] = pattern.split('/');
  if (star !== '*') return [{ label: pattern, dir: join(root, pattern), required: true }];

  try {
    return readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        label: [parent, entry.name, ...rest].join('/'),
        dir: join(root, parent, entry.name, ...rest),
        required: hasVitestConfig(join(root, parent, entry.name)),
      }));
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
 * Every test file the scan reads under `root`, and what the scan is blind to:
 * each `SCANNED_DIRS` entry that matched no test file, and each required
 * directory inside a `*` entry that holds none. The CLI refuses both.
 *
 * @param {string} [root]
 * @returns {{ files: string[], empty: string[] }}
 */
export function scannedFiles(root = ROOT) {
  const dirs = SCANNED_DIRS.flatMap((pattern) =>
    expand(root, pattern).map((dir) => ({ ...dir, pattern, files: testFiles(dir.dir) })),
  );
  const blindPatterns = SCANNED_DIRS.filter((pattern) =>
    dirs.every((dir) => dir.pattern !== pattern || dir.files.length === 0),
  );
  const blindDirs = dirs.filter(
    (dir) =>
      dir.required && dir.files.length === 0 && !blindPatterns.includes(dir.pattern),
  );

  return {
    files: dirs.flatMap(({ files }) => files),
    empty: [...blindPatterns, ...blindDirs.map(({ label }) => label)],
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
        `nothing proves nothing; move the tests back or fix SCANNED_DIRS in ` +
        `scripts/vitest-control-scan.mjs`,
    );
    process.exit(2);
  }

  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = filesToScan();

  const unreadable = files.filter((file) => !existsSync(file));
  if (unreadable.length > 0) {
    console.error(
      `vitest-control-scan: no such file ${unreadable.map((file) => relative(ROOT, file)).join(', ')}`,
    );
    process.exit(2);
  }

  const findings = files.flatMap((file) =>
    controlCalls(readFileSync(file, 'utf8')).map((call) => ({
      ...call,
      file: relative(ROOT, file),
    })),
  );

  for (const { file, line, call, documented } of findings) {
    const effect = EFFECT[/** @type {keyof typeof EFFECT} */ (call.split('.')[1])];
    const note = documented ? `documented with a reason, ${effect}` : 'no reason given';
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

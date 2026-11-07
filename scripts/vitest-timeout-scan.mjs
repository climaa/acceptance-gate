// @ts-check
//
// Every vitest config extends the root preset (`vitest.shared.mjs`), and none
// writes a `testTimeout` or `hookTimeout` below its floor. The preset says why
// the floor is 20 s; this is the tripwire that keeps a workspace from quietly
// going back to vitest's 5 s, as vitest-control-scan keeps `.only` out.
//
// It reads text, not the resolved config: a `testTimeout:` or `hookTimeout:`
// whose value is not a number literal is refused rather than passed unjudged,
// and a config that never imports the preset is refused, because it waits
// vitest's defaults whatever it writes.
//
//   node scripts/vitest-timeout-scan.mjs              every vitest config here
//   node scripts/vitest-timeout-scan.mjs <file>...    these files, for checking a copy
//
// Exit 0: every config at or above the floor. 1: one below it, unreadable as a
// number, or not extending the preset. 2: nothing to judge (no config found,
// or a named file missing).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TIMEOUT_FLOOR_MS } from '../vitest.shared.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A workspace's config, and the root's own suites (`vitest.sandcastle.config.mts`). */
const WORKSPACE_CONFIG = /^vitest\.config\.[cm]?[jt]s$/;
const ROOT_CONFIG = /^vitest\.(?:[\w-]+\.)?config\.[cm]?[jt]s$/;

/** `testTimeout: 5_000,` — the key and its value up to the next `,` or `}`. */
const TIMEOUT = /\b(testTimeout|hookTimeout)\s*:\s*([^,}\n]+)/g;

const NUMBER = /^\d[\d_]*$/;

const PRESET_IMPORT = /from\s+['"](?:\.\.?\/)+vitest\.shared\.mjs['"]/;

/** A whole-line comment: a timeout named there is prose, not configuration. */
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/;

/**
 * What is wrong with one config's timeouts, as sentences; none when it passes.
 *
 * @param {string} text  A vitest config.
 * @returns {string[]}
 */
export function timeoutProblems(text) {
  const code = text
    .split('\n')
    .filter((line) => !COMMENT_LINE.test(line))
    .join('\n');

  const timeouts = [...code.matchAll(TIMEOUT)].map(([, key, raw]) => {
    const value = (raw ?? '').trim();
    if (!NUMBER.test(value)) {
      return `${key} is \`${value}\`, not a number literal the scan can judge`;
    }
    const ms = Number(value.replaceAll('_', ''));

    return ms < TIMEOUT_FLOOR_MS
      ? `${key} is ${ms} ms, below the preset floor of ${TIMEOUT_FLOOR_MS}`
      : null;
  });

  return [
    ...(PRESET_IMPORT.test(code)
      ? []
      : ['does not import the preset from vitest.shared.mjs']),
    ...timeouts.filter((problem) => problem !== null),
  ];
}

/** @param {string} dir @param {RegExp} pattern @returns {string[]} */
function matching(dir, pattern) {
  try {
    return readdirSync(dir)
      .filter((name) => pattern.test(name))
      .map((name) => join(dir, name));
  } catch {
    return [];
  }
}

/** @param {string} dir @returns {string[]} */
function subdirectories(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Every vitest config under `root`: each workspace's under `apps/*` and
 * `packages/*`, and the root's own.
 *
 * @param {string} [root]
 * @returns {string[]}
 */
export function vitestConfigs(root = ROOT) {
  const workspaces = ['apps', 'packages'].flatMap((parent) =>
    subdirectories(join(root, parent)),
  );

  return [
    ...matching(root, ROOT_CONFIG),
    ...workspaces.flatMap((dir) => matching(dir, WORKSPACE_CONFIG)),
  ];
}

/** The file arguments, or every config; exits 2 when there is nothing to judge.
 *  @returns {string[]} */
function filesToScan() {
  const files =
    process.argv.length > 2
      ? process.argv.slice(2).map((file) => resolve(file))
      : vitestConfigs();

  const missing = files.filter((file) => !existsSync(file));
  if (files.length === 0 || missing.length > 0) {
    console.error(
      files.length === 0
        ? 'vitest-timeout-scan: no vitest config found. A scan that reads nothing proves nothing'
        : `vitest-timeout-scan: no such file ${missing.map((file) => relative(ROOT, file)).join(', ')}`,
    );
    process.exit(2);
  }

  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = filesToScan();

  const findings = files.flatMap((file) =>
    timeoutProblems(readFileSync(file, 'utf8')).map(
      (problem) => `  ${relative(ROOT, file)} — ${problem}`,
    ),
  );

  if (findings.length > 0) {
    console.error(findings.join('\n'));
    console.error(
      `vitest-timeout-scan: ${findings.length} problem(s). Extend vitest.shared.mjs and ` +
        `wait at least ${TIMEOUT_FLOOR_MS} ms; raise a timeout, never lower it`,
    );
    process.exit(1);
  }

  console.log(
    `vitest-timeout-scan: ${files.length} config(s), every timeout at or above ${TIMEOUT_FLOOR_MS} ms`,
  );
}

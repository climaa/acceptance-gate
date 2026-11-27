// @ts-check
//
// CRAP gate. Scores every function census measures with fallow, using the
// coverage maps the gate's `test` and `sandcastle` checks just wrote, and fails
// when a function at CRAP 30 or more is not on the frozen list, when a listed
// function scores above its frozen value, or when the coverage is not real.
//
// CRAP = CC² × (1 − coverage)³ + CC: a complex function is only safe to change
// when tests cover it. The threshold is the one census counts (`crapOver30`), so
// the gate and the census page name the same functions.
//
// The frozen list, scripts/gate/crap-frozen.json, holds the offenders that
// predate the gate, each with its CRAP when it was frozen. A listed function may
// go down, never up. A missing list is an empty one, so every offender is new.
//
// Coverage that is not real fails loud instead of passing: with no map, fallow
// estimates coverage from the import graph, and a gate scored on that estimate
// would pass or fail for reasons no test explains.
//
// The maps are merged here because fallow takes one `--coverage`. Each key is an
// absolute path, and a turbo cache hit restores a map written by another
// checkout of this repository, whose paths fallow would not match. So every key
// is moved onto this checkout's root before fallow sees it.
//
//   node scripts/crap-gate.mjs
//
// Exit 0: every function under 30, or on the list at or under its value.
// 1: a new or risen function, or no real coverage.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const MAX_CRAP = 30;

export const FROZEN_FILE = 'scripts/gate/crap-frozen.json';

/** What census measures: its workspaces and the pseudo-workspaces its shared config covers. */
export const SCOPE = [
  'apps/',
  'packages/',
  'scripts/',
  '.sandcastle/',
  '.claude/skills/pixel-perfect-session/',
];

/** The directories whose children each run a vitest suite of their own. */
const WORKSPACE_PARENTS = ['apps', 'packages'];

/** The configs that make a directory a suite: the root's hermetic one, a workspace's own. */
const ROOT_CONFIG = 'vitest.sandcastle.config.mts';
const CONFIG_NAMES = [
  'vitest.config.mts',
  'vitest.config.ts',
  'vitest.config.mjs',
  'vitest.config.js',
];

const MAP = join('coverage', 'coverage-final.json');

const REMEDY =
  '  Cover these functions with tests first; if one still scores 30 or more, ' +
  'extract helpers until it does not.';

/**
 * @typedef {{ dir: string, file: string }} CoverageMap  `dir` is the suite's
 *   directory relative to the root, '' for the root's own suite.
 * @typedef {{ path: string, name: string, line: number, cyclomatic: number,
 *   crap?: number, coverage_source?: string }} Finding
 * @typedef {{ path: string, name: string, crap: number }} FrozenEntry
 * @typedef {{ finding: Finding, frozen: number | null }} Failure
 */

/**
 * The workspace directories under `root`, relative to it.
 *
 * @param {string} root
 * @returns {string[]}
 */
function workspaceDirs(root) {
  return WORKSPACE_PARENTS.filter((parent) => existsSync(join(root, parent))).flatMap(
    (parent) =>
      readdirSync(join(root, parent))
        .sort()
        .map((name) => `${parent}/${name}`),
  );
}

/**
 * Every vitest suite under `root`, with where its coverage map is written: the
 * root's own suite and each workspace with a config.
 *
 * @param {string} root
 * @returns {CoverageMap[]}
 */
export function suites(root) {
  const own = existsSync(join(root, ROOT_CONFIG)) ? [''] : [];
  const workspaces = workspaceDirs(root).filter((dir) =>
    CONFIG_NAMES.some((name) => existsSync(join(root, dir, name))),
  );
  return [...own, ...workspaces].map((dir) => ({ dir, file: join(root, dir, MAP) }));
}

/**
 * `key`, an absolute path some checkout wrote, as the same file under `root`:
 * the longest tail of it that exists there and lies in the suite's directory.
 * Null when no tail does, a file this checkout no longer has.
 *
 * @param {string} key
 * @param {string} root
 * @param {string} dir
 * @returns {string | null}
 */
export function rebase(key, root, dir) {
  const parts = key.split(/[\\/]/).filter(Boolean);
  const prefix = dir === '' ? '' : `${dir}/`;
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join('/');
    if (tail.startsWith(prefix) && existsSync(join(root, tail))) return join(root, tail);
  }
  return null;
}

/**
 * One coverage map of every file in `maps`, each keyed by its path under `root`.
 *
 * @param {CoverageMap[]} maps
 * @param {string} root
 * @returns {Record<string, { path: string }>}
 */
export function mergeMaps(maps, root) {
  /** @type {Record<string, { path: string }>} */
  const merged = {};
  for (const map of maps) {
    const entries = Object.entries(JSON.parse(readFileSync(map.file, 'utf8')));
    for (const [key, entry] of entries) {
      const path = rebase(key, root, map.dir);
      if (path !== null) merged[path] = { ...entry, path };
    }
  }
  return merged;
}

/**
 * Why fallow's summary shows it did not read every file of the map; null when it did.
 *
 * @param {Record<string, unknown>} summary
 * @returns {string | null}
 */
function matchProblem(summary) {
  const matched = Number(summary.istanbul_files_matched ?? 0);
  const total = Number(summary.istanbul_files_total ?? 0);
  if (summary.coverage_model !== 'istanbul' || matched === 0)
    return 'fallow matched no file of the coverage map, so every score is an estimate';
  if (matched < total)
    return `fallow matched ${matched} of the ${total} files in the coverage map; the rest are scored on an estimate`;
  return null;
}

/**
 * Why fallow's `report` was not scored on real coverage; null when it was.
 *
 * @param {{ summary?: Record<string, unknown>, findings?: Finding[] }} report
 * @returns {string | null}
 */
export function coverageProblem(report) {
  const scored = (report.findings ?? []).filter((f) => f.crap !== undefined);
  const estimated =
    scored.length > 0 && scored.every((f) => f.coverage_source === 'estimated');
  return (
    matchProblem(report.summary ?? {}) ??
    (estimated ? 'every CRAP finding is scored on estimated coverage' : null)
  );
}

/**
 * The findings in census's scope that score at or above the threshold.
 *
 * @param {{ findings?: Finding[] }} report
 * @returns {Finding[]}
 */
export function offenders(report) {
  return (report.findings ?? []).filter(
    (f) =>
      (f.crap ?? 0) >= MAX_CRAP &&
      SCOPE.some((prefix) => (f.path ?? '').startsWith(prefix)),
  );
}

/** @param {{ path: string, name: string }} f */
const keyOf = (f) => `${f.path}#${f.name}`;

/**
 * Each offender that is not on the frozen list, or scores above its frozen value.
 *
 * @param {Finding[]} found
 * @param {FrozenEntry[]} frozen
 * @returns {Failure[]}
 */
export function judge(found, frozen) {
  const limits = new Map(frozen.map((entry) => [keyOf(entry), entry.crap]));
  return found
    .map((finding) => ({ finding, frozen: limits.get(keyOf(finding)) ?? null }))
    .filter(({ finding, frozen }) => frozen === null || (finding.crap ?? 0) > frozen)
    .sort((a, b) => (b.finding.crap ?? 0) - (a.finding.crap ?? 0));
}

/**
 * The coverage fallow scored `f` with, in percent, recovered from its CRAP and
 * cyclomatic complexity: fallow reports the score, not the coverage it used.
 *
 * @param {Finding} f
 * @returns {number}
 */
export function coverageOf(f) {
  const cc = f.cyclomatic;
  const uncovered = Math.cbrt(Math.max(0, (f.crap ?? cc) - cc) / (cc * cc));
  return Math.round(100 * Math.max(0, 1 - uncovered));
}

/**
 * The lines a failing run prints: one per function, then the remedy.
 *
 * @param {Failure[]} failures
 * @returns {string[]}
 */
export function failureLines(failures) {
  const lines = failures.map(({ finding: f, frozen }) => {
    const estimated = f.coverage_source === 'estimated' ? ' (estimated)' : '';
    const limit = frozen === null ? 'not on the frozen list' : `frozen at ${frozen}`;
    return `    CRAP ${f.crap}  coverage ${coverageOf(f)}%${estimated}  ${limit}  ${f.name}  (${f.path}:${f.line})`;
  });
  return [
    `✗ CRAP ${MAX_CRAP} exceeded by ${failures.length} function(s) new to it or above their frozen value`,
    ...lines,
    REMEDY,
  ];
}

/**
 * The frozen list at `root`; empty when the file does not exist.
 *
 * @param {string} root
 * @returns {FrozenEntry[]}
 */
export function readFrozen(root) {
  const file = join(root, FROZEN_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

/**
 * `fallow health` on `coverage`, as fallow's JSON text. fallow exits 1 whenever
 * it has findings of its own; that is not this gate, so its stdout is kept.
 *
 * @param {string} root
 * @param {string} coverage
 * @returns {string}
 */
function runFallow(root, coverage) {
  const args = ['exec', 'fallow', 'health', '--coverage', coverage];
  try {
    return execFileSync(
      'pnpm',
      [...args, '--max-crap', String(MAX_CRAP), '--format', 'json'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch (err) {
    const stdout = /** @type {{ stdout?: Buffer | string }} */ (err).stdout;
    if (stdout) return stdout.toString();
    throw err;
  }
}

/**
 * fallow's report on `maps`, merged into one file under `root`.
 *
 * @param {string} root
 * @param {CoverageMap[]} maps
 * @param {(root: string, coverage: string) => string} fallow
 */
function score(root, maps, fallow) {
  const dir = mkdtempSync(join(tmpdir(), 'crap-gate-'));
  try {
    const coverage = join(dir, 'coverage-final.json');
    writeFileSync(coverage, JSON.stringify(mergeMaps(maps, root)));
    return JSON.parse(fallow(root, coverage));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Why the suites under `root` left too little coverage to score; null when each left its map.
 *
 * @param {CoverageMap[]} all
 * @returns {string | null}
 */
export function mapsProblem(all) {
  const missing = all.filter((suite) => !existsSync(suite.file));
  if (all.length === 0) return 'no vitest suite found, so there is no coverage map';
  if (missing.length === 0) return null;
  const names = missing.map((suite) => join(suite.dir || '.', MAP)).join(', ');
  return `no coverage map from ${missing.length} of ${all.length} suite(s): ${names}`;
}

/**
 * The gate. Prints its verdict and returns the exit code.
 *
 * @param {{ root?: string, fallow?: (root: string, coverage: string) => string }} [options]
 * @returns {0 | 1}
 */
export function main({ root = ROOT, fallow = runFallow } = {}) {
  const all = suites(root);
  const missing = mapsProblem(all);
  if (missing !== null) {
    console.error(
      `✗ crap: ${missing}. Run the suites first: pnpm turbo run test && pnpm test:sandcastle.`,
    );
    return 1;
  }
  const report = score(root, all, fallow);
  const problem = coverageProblem(report);
  if (problem !== null) {
    console.error(
      `✗ crap: ${problem}. Re-run the suites so each leaves its coverage map.`,
    );
    return 1;
  }
  const found = offenders(report);
  const failures = judge(found, readFrozen(root));
  if (failures.length > 0) {
    for (const line of failureLines(failures)) console.error(line);
    return 1;
  }
  console.log(
    `✓ crap OK — ${found.length} function(s) at CRAP ${MAX_CRAP} or more, each on the frozen list at or under its value.`,
  );
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main());

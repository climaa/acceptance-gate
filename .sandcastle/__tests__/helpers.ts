// Shared harness for the source-text half of this suite.
//
// The `ROOT` / `SANDCASTLE` / `read()` preamble was copy-pasted byte-identically
// into 17 test files — fallow reported it as a 14-line block duplicated 11
// times, the largest single source of this repo's duplication figure. All 17
// copies agreed, which is the good case; the risk was that the eighteenth
// would not, and a test reading from a subtly different root would pass while
// asserting against the wrong file.
//
// Deliberately named `helpers.ts`, not `*.test.ts`: vitest.sandcastle.config.mts
// collects `__tests__/**/*.test.ts`, so this is importable without being
// collected as a suite of its own. .sandcastle/tsconfig.json includes
// `__tests__/**/*.ts`, so it is still type-checked.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Repository root — two levels up from `.sandcastle/__tests__/`. */
export const ROOT = path.resolve(__dirname, '../..');

/** The orchestrator directory. */
export const SANDCASTLE = path.join(ROOT, '.sandcastle');

/** Read a file relative to `.sandcastle/`, e.g. `read('main.mts')`. */
export function read(file: string): string {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

/** Read a file relative to the repository root. */
export function readFromRoot(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/**
 * Strip comments so "must not appear" assertions test the actual code.
 *
 * Several modules document at length why they do NOT do something — naming the
 * forbidden API in prose. Without this, those explanations would fail the very
 * assertions they explain.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

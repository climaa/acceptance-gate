/**
 * The two committed files as the app reads them at build: absent, or valid.
 * Anything else throws, and a throw during prerender fails `next build` — a
 * mismatch between the files and `measurement.ts` never reaches a page.
 *
 * `parseCommitted` is the rule; `readCommitted` is the one place `lib/` touches
 * the disk, and only to hand it the files' text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { History, Measurement } from './measurement.ts';
import { validateHistory, validateMeasurement } from './validate.ts';

export type Committed =
  { state: 'empty' } | { state: 'measured'; measurement: Measurement; history: History };

export interface CommittedText {
  /** `measurement.json`'s text, or `null` when no file is committed. */
  measurement: string | null;
  /** `history.json`'s text, or `null` when no file is committed. */
  history: string | null;
}

type Parsed = { value: unknown; problems: string[] };

function parseJson(file: string, text: string): Parsed {
  try {
    return { value: JSON.parse(text), problems: [] };
  } catch {
    return { value: undefined, problems: [`${file}: not JSON`] };
  }
}

function checked(
  file: string,
  text: string,
  validate: (value: unknown) => string[],
): Parsed {
  const parsed = parseJson(file, text);
  if (parsed.problems.length > 0) return parsed;
  return {
    value: parsed.value,
    problems: validate(parsed.value).map((problem) => `${file}: ${problem}`),
  };
}

function fail(problems: readonly string[]): never {
  throw new Error(
    `census cannot build from the committed files:\n${problems.map((p) => `  ${p}`).join('\n')}`,
  );
}

/** The committed files' text as the app's state; throws listing every problem. */
export function parseCommitted(text: CommittedText): Committed {
  if (text.measurement === null && text.history === null) return { state: 'empty' };
  if (text.measurement === null) fail(['measurement.json: missing beside history.json']);
  if (text.history === null) fail(['history.json: missing beside measurement.json']);

  const measurement = checked('measurement.json', text.measurement, validateMeasurement);
  const history = checked('history.json', text.history, validateHistory);
  const problems = [...measurement.problems, ...history.problems];
  if (problems.length > 0) fail(problems);

  return {
    state: 'measured',
    measurement: measurement.value as Measurement,
    history: history.value as History,
  };
}

function readIfThere(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Reads `measurement.json` and `history.json` from the app's directory. */
export function readCommitted(appDir: string): Committed {
  return parseCommitted({
    measurement: readIfThere(path.join(appDir, 'measurement.json')),
    history: readIfThere(path.join(appDir, 'history.json')),
  });
}

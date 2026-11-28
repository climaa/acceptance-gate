/**
 * The two committed files as the app reads them at build: absent, or valid.
 * Anything else throws, and a throw during prerender fails `next build` — a
 * mismatch between the files and `measurement.ts` never reaches a page.
 *
 * `parseCommitted` is the rule; `readCommitted` is the one place `lib/` touches
 * the disk, and only to hand it the files' text.
 *
 * `CENSUS_DATA_DIR` points the reader at another directory: the output of
 * `census:measure --root <checkout> --out <dir>`, which leaves the checkout's
 * `census.config.json` beside the two files. The measurement is then judged by
 * that repository's feature map, not this one's, and is `local`: nothing here
 * committed it. Unset, the app reads its own directory, as the build does.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CHECKOUT_CONFIG, parseConfig } from './config.ts';
import { FEATURE_MAP, type FeatureMap } from './features.ts';
import type { History, Measurement } from './measurement.ts';
import { validateHistory, validateMeasurement } from './validate.ts';

/** `committed` is this repository's own file; `local` came from `CENSUS_DATA_DIR`. */
export type Source = 'committed' | 'local';

export type Committed =
  | { state: 'empty' }
  | {
      state: 'measured';
      measurement: Measurement;
      history: History;
      /** The feature map of the repository the measurement measures. */
      map: FeatureMap;
      source: Source;
    };

export interface CommittedText {
  /** `measurement.json`'s text, or `null` when no file is committed. */
  measurement: string | null;
  /** `history.json`'s text, or `null` when no file is committed. */
  history: string | null;
  /** The measured checkout's `census.config.json` text, or `null` for this repository. */
  config?: string | null;
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

function mapOf(text: string | null | undefined): { map: FeatureMap; problems: string[] } {
  if (text === null || text === undefined) return { map: FEATURE_MAP, problems: [] };
  const json = parseJson(CHECKOUT_CONFIG, text);
  if (json.problems.length > 0) return { map: FEATURE_MAP, problems: json.problems };
  const parsed = parseConfig(json.value);
  if ('problems' in parsed) {
    return {
      map: FEATURE_MAP,
      problems: parsed.problems.map((problem) =>
        problem.startsWith(`${CHECKOUT_CONFIG}:`)
          ? problem
          : `${CHECKOUT_CONFIG}: ${problem}`,
      ),
    };
  }
  const { apps, features, localFeatures } = parsed.config;
  return { map: { apps, features, localFeatures }, problems: [] };
}

function fail(problems: readonly string[]): never {
  throw new Error(
    `census cannot build from the committed files:\n${problems.map((p) => `  ${p}`).join('\n')}`,
  );
}

/** The committed files' text as the app's state; throws listing every problem. */
export function parseCommitted(
  text: CommittedText,
  source: Source = 'committed',
): Committed {
  if (text.measurement === null && text.history === null) return { state: 'empty' };
  if (text.measurement === null) fail(['measurement.json: missing beside history.json']);
  if (text.history === null) fail(['history.json: missing beside measurement.json']);

  const { map, problems: configProblems } = mapOf(text.config);
  if (configProblems.length > 0) fail(configProblems);
  const measurement = checked('measurement.json', text.measurement, (value) =>
    validateMeasurement(value, map),
  );
  const history = checked('history.json', text.history, validateHistory);
  const problems = [...measurement.problems, ...history.problems];
  if (problems.length > 0) fail(problems);

  return {
    state: 'measured',
    measurement: measurement.value as Measurement,
    history: history.value as History,
    map,
    source,
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

/**
 * Reads `measurement.json` and `history.json` from `dataDir` when one is given
 * (with the `census.config.json` beside them, if any), else from the app's
 * directory.
 */
export function readCommitted(
  appDir: string,
  dataDir: string | undefined = process.env.CENSUS_DATA_DIR,
): Committed {
  const local = dataDir !== undefined && dataDir !== '';
  const dir = local ? dataDir : appDir;
  return parseCommitted(
    {
      measurement: readIfThere(path.join(dir, 'measurement.json')),
      history: readIfThere(path.join(dir, 'history.json')),
      config: local ? readIfThere(path.join(dir, CHECKOUT_CONFIG)) : null,
    },
    local ? 'local' : 'committed',
  );
}

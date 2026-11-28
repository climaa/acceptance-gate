/**
 * The check both committed files pass before the measure step writes either, and
 * again when the app builds from them. It returns every problem it finds, each as
 * `<path>: <what is wrong>`, so one run lists all of them; an empty list is valid.
 *
 * Shape first (`measurement.ts`). Only a file of the right shape goes on to the
 * rules that relate one field to another, since those rules read fields the shape
 * check vouches for.
 */
import type { z } from 'zod';

import {
  FEATURE_MAP,
  featureName,
  featureWorkspace,
  type FeatureMap,
} from './features.ts';
import {
  historySchema,
  measurementSchema,
  type History,
  type Measurement,
} from './measurement.ts';

type Lines = { covered: number; total: number; pct: number };

function shapeProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

/** What `pct` must be: one decimal, and 100 for a file with nothing to cover, as v8's summary says. */
function expectedPct({ covered, total }: Lines): number {
  return total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
}

function lineProblems(where: string, lines: Lines): string[] {
  const problems: string[] = [];
  if (lines.covered > lines.total) {
    problems.push(`${where}: covered ${lines.covered} > total ${lines.total}`);
  }
  const pct = expectedPct(lines);
  if (lines.pct !== pct) {
    problems.push(
      `${where}.pct: ${lines.pct}, but ${lines.covered}/${lines.total} is ${pct}`,
    );
  }
  return problems;
}

/** `testedAsProcess` explains zero covered lines, so it is refused on a file with any. */
function processProblems(
  where: string,
  file: { lines: Lines; testedAsProcess?: true },
): string[] {
  if (!file.testedAsProcess || file.lines.covered === 0) return [];
  return [
    `${where}.testedAsProcess: ${file.lines.covered} lines are covered, so it is not tested only as a process`,
  ];
}

function codeProblems(measurement: Measurement): string[] {
  return measurement.workspaces.flatMap((ws, w) => {
    const code = ws.dimensions.code;
    if (code.state !== 'measured') return [];
    const where = `workspaces.${w}.dimensions.code`;
    return [
      ...lineProblems(`${where}.lines`, code.lines),
      ...code.files.flatMap((file, f) => [
        ...lineProblems(`${where}.files.${f}.lines`, file.lines),
        ...processProblems(`${where}.files.${f}`, file),
      ]),
    ];
  });
}

function featureProblems(measurement: Measurement, map: FeatureMap): string[] {
  return measurement.workspaces.flatMap((ws, w) => {
    const acceptance = ws.dimensions.acceptance;
    if (acceptance.state !== 'measured') return [];
    return acceptance.features.flatMap((feature, f) => {
      const where = `workspaces.${w}.dimensions.acceptance.features.${f}`;
      const visits = featureWorkspace(featureName(feature), map);
      if (visits === undefined) return [`${where}: ${feature} is not in the feature map`];
      if (visits !== ws.path)
        return [`${where}: ${feature} visits ${visits}, not ${ws.path}`];
      return [];
    });
  });
}

/** `<path>: duplicate of <first> (<value>)` for each repeat of a key, first one kept. */
function duplicates<T>(
  items: readonly T[],
  key: (item: T) => string,
  path: string,
): string[] {
  const first = new Map<string, number>();
  return items.flatMap((item, index) => {
    const value = key(item);
    const seen = first.get(value);
    if (seen === undefined) {
      first.set(value, index);
      return [];
    }
    return [
      `${path.replace('#', String(index))}: duplicate of ${path.split('.')[0]}.${seen} (${value})`,
    ];
  });
}

function gapProblems(measurement: Measurement): string[] {
  const names = new Set(measurement.workspaces.map((ws) => ws.name));
  const unknown = measurement.gaps.flatMap((gap, g) =>
    names.has(gap.workspace)
      ? []
      : [`gaps.${g}.workspace: no workspace is named ${gap.workspace}`],
  );
  return [...duplicates(measurement.gaps, (gap) => gap.id, 'gaps.#.id'), ...unknown];
}

/**
 * Every problem with a would-be `measurement.json`; empty when it is valid. `map`
 * is the feature map of the repository it measures: this one's unless given.
 */
export function validateMeasurement(
  value: unknown,
  map: FeatureMap = FEATURE_MAP,
): string[] {
  const parsed = measurementSchema.safeParse(value);
  if (!parsed.success) return shapeProblems(parsed.error);
  return [
    ...codeProblems(parsed.data),
    ...featureProblems(parsed.data, map),
    ...gapProblems(parsed.data),
  ];
}

function orderProblems(history: History): string[] {
  return history.points.flatMap((point, index) => {
    const previous = history.points[index - 1];
    if (
      previous === undefined ||
      Date.parse(point.measuredAt) >= Date.parse(previous.measuredAt)
    ) {
      return [];
    }
    return [
      `points.${index}.measuredAt: ${point.measuredAt} is before points.${index - 1} (${previous.measuredAt})`,
    ];
  });
}

/** Every problem with a would-be `history.json`; empty when it is valid. */
export function validateHistory(value: unknown): string[] {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) return shapeProblems(parsed.error);
  return [
    ...orderProblems(parsed.data),
    ...duplicates(parsed.data.points, (point) => point.commit, 'points.#.commit'),
  ];
}

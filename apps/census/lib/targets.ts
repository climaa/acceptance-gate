import { blobHref } from './links.ts';
import type { Measurement } from './measurement.ts';

type RefactorTarget = Measurement['health']['refactorTargets'][number];

export interface TargetView {
  path: string;
  href: string;
  /** What fallow recommends; empty when the measurement recorded none. */
  action: string;
  effort: string;
  priority: number;
}

/**
 * fallow's recommendation as the row reads it: the advice without the evidence
 * around it (`Remove 5 unused exports to reduce surface area (100% dead)` →
 * `remove 5 unused exports`). A sentence it does not know stays whole.
 */
export function targetAction(recommendation: string | undefined): string {
  if (recommendation === undefined) return '';
  if (/^Changes with .* without an import,/.test(recommendation)) {
    return 'make a hidden coupling explicit';
  }
  const advice = recommendation
    .replace(/ \([^)]*\)/g, '')
    .replace(/ to reduce surface area$/, '')
    .replace(/^.* lack test coverage path, /, '');
  return advice.charAt(0).toLowerCase() + advice.slice(1);
}

/** The targets as both pages list them, costliest first. */
export function targetViews(
  m: Measurement,
  targets: readonly RefactorTarget[],
): TargetView[] {
  return [...targets]
    .sort((a, b) => b.priority - a.priority)
    .map((t) => ({
      path: t.path,
      href: blobHref(m, t.path),
      action: targetAction(t.recommendation),
      effort: t.effort,
      priority: t.priority,
    }));
}

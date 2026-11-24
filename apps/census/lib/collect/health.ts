/**
 * The Health dimension, read from fallow 3.36.0's JSON (always run pinned with
 * `npx fallow@3.36.0`: the global binary is another major and another shape).
 *
 * Health is shown, never a gap. Its values come from four fallow reports the
 * measure step runs: `health` (score, vital signs, file scores, hotspots, targets,
 * coverage gaps, styling), a complexity-only `health` with the cognitive ceiling
 * at 20 (the same functions `scripts/complexity-gate.mjs` names), `dead-code`, and
 * `dupes` in its mild and semantic modes. `list` says whether boundaries are configured. A workspace's score is its fallow group:
 * `--group-by package` for a workspace, `--group-by directory` for a
 * pseudo-workspace, which fallow cannot see as a package.
 */
import type { RepositoryHealth, Workspace } from '../measurement.ts';

type Path = { path: string };
type Risk = {
  low_risk: number;
  medium_risk: number;
  high_risk: number;
  very_high_risk: number;
};
type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
type DupeStats = {
  duplication_percentage: number;
  duplicated_lines: number;
  clone_groups: number;
};

/** Only the fields census reads; fallow's reports carry far more. */
export interface FallowReports {
  health: {
    summary: { coverage_model: string };
    health_score: { score: number; grade: string; penalties: Record<string, number> };
    vital_signs: {
      duplication_pct: number;
      counts: { total_files: number; total_exports: number };
      unit_size_profile: Risk;
      unit_interfacing_profile: Risk;
    };
    file_scores: (Path & {
      maintainability_index: number;
      crap_max: number;
      crap_above_threshold: number;
      total_cognitive: number;
    })[];
    hotspots: (Path & { score: number; commits: number })[];
    targets: (Path & { priority: number; effort: string })[];
    coverage_gaps: { files: Path[] };
    styling_health?: { score: number; grade: string };
    styling_findings?: { code: string; sub_kind?: string }[];
    css_analytics?: { files: { analytics: { important_declarations: number } }[] };
  };
  complexity: { findings: (Path & { cognitive: number })[] };
  dead: {
    summary: {
      unused_files: number;
      unused_exports: number;
      unused_types: number;
      unlisted_dependencies: number;
      circular_dependencies: number;
    };
    unused_files: Path[];
    unused_exports: Path[];
  };
  /** Whether any architecture boundary is configured for fallow to check. */
  boundaries: { boundaries: { configured: boolean } };
  dupesMild: { stats: DupeStats };
  dupesSemantic: { stats: DupeStats };
  /** Score and grade by fallow group key: a package name, or a top directory. */
  groups: Readonly<Record<string, { score: number; grade: string }>>;
}

const HOTSPOTS_SHOWN = 20;
const round1 = (n: number) => Math.round(n * 10) / 10;
const profile = (risk: Risk) => [
  risk.low_risk,
  risk.medium_risk,
  risk.high_risk,
  risk.very_high_risk,
];

function styling(health: FallowReports['health']): RepositoryHealth['styling'] {
  if (!health.styling_health) return undefined;
  const findings = health.styling_findings ?? [];
  const count = (code: string, subKind?: string) =>
    findings.filter(
      (f) => f.code === code && (subKind === undefined || f.sub_kind === subKind),
    ).length;
  return {
    score: health.styling_health.score,
    grade: health.styling_health.grade,
    tokenDrift: count('css-token-drift'),
    duplicateBlocks: count('css-duplicate-block'),
    complexSelectors: count('css-selector-complexity', 'complex-selector'),
    important: (health.css_analytics?.files ?? []).reduce(
      (sum, file) => sum + file.analytics.important_declarations,
      0,
    ),
  };
}

/** The repository-wide Health block of a measurement. */
export function repositoryHealth(reports: FallowReports): RepositoryHealth {
  const { health, dead, boundaries, dupesMild, dupesSemantic } = reports;
  const cognitive = new Map(health.file_scores.map((f) => [f.path, f.total_cognitive]));
  const css = styling(health);
  return {
    score: health.health_score.score,
    grade: health.health_score.grade,
    penalties: Object.entries(health.health_score.penalties)
      .filter(([, points]) => points > 0)
      .map(([name, points]) => ({ name: name.replaceAll('_', ' '), points }))
      .sort((a, b) => b.points - a.points),
    dead: {
      files: dead.summary.unused_files,
      exports: dead.summary.unused_exports,
      types: dead.summary.unused_types,
      unlistedDeps: dead.summary.unlisted_dependencies,
      cycles: dead.summary.circular_dependencies,
      totalFiles: health.vital_signs.counts.total_files,
      totalExports: health.vital_signs.counts.total_exports,
      boundaries: boundaries.boundaries.configured,
    },
    duplication: {
      semanticPct: round1(dupesSemantic.stats.duplication_percentage),
      mildPct: round1(dupesMild.stats.duplication_percentage),
      lines: dupesMild.stats.duplicated_lines,
      groups: dupesMild.stats.clone_groups,
    },
    ...(css === undefined ? {} : { styling: css }),
    hotspots: [...health.hotspots]
      .sort((a, b) => b.score - a.score)
      .slice(0, HOTSPOTS_SHOWN)
      .map((h) => ({
        path: h.path,
        churn: h.commits,
        complexity: cognitive.get(h.path) ?? 0,
      })),
    refactorTargets: health.targets.map((t) => ({
      path: t.path,
      priority: t.priority,
      effort: t.effort,
    })),
    profiles: {
      unitSize: profile(health.vital_signs.unit_size_profile),
      interfacing: profile(health.vital_signs.unit_interfacing_profile),
    },
    crapOver30: health.file_scores.reduce((sum, f) => sum + f.crap_above_threshold, 0),
    crapSource:
      health.summary.coverage_model === 'static_estimated' ? 'estimated' : 'measured',
  };
}

const isGrade = (grade: string): grade is Grade =>
  ['A', 'B', 'C', 'D', 'F'].includes(grade);

/** A workspace's Health value: its fallow group's score, and what falls under its path. */
export function workspaceHealth(
  reports: FallowReports,
  workspace: Pick<Workspace, 'name' | 'path'>,
): Workspace['dimensions']['health'] {
  // A pseudo-workspace is named by its path with a trailing slash, and fallow only
  // knows it as a directory group: its top directory.
  const key = workspace.name.endsWith('/')
    ? workspace.path.split('/')[0]
    : workspace.name;
  const group = key === undefined ? undefined : reports.groups[key];
  if (!group || !isGrade(group.grade)) {
    return {
      dimension: 'health',
      state: 'not-applicable',
      reason: 'No source file for fallow to score',
    };
  }
  const under = (items: readonly Path[]) =>
    items.filter((item) => item.path.startsWith(`${workspace.path}/`)).length;
  return {
    dimension: 'health',
    state: 'measured',
    score: round1(group.score),
    grade: group.grade,
    overCeiling: under(reports.complexity.findings.filter((f) => f.cognitive > 20)),
    deadFiles: under(reports.dead.unused_files),
    deadExports: under(reports.dead.unused_exports),
    refactorTargets: under(reports.health.targets),
  };
}

/** Workspace-relative fallow scores and untested files, for `codeValue`. */
export function fileFacts(reports: FallowReports, workspacePath: string) {
  const prefix = `${workspacePath}/`;
  const scores = new Map(
    reports.health.file_scores
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => [
        f.path.slice(prefix.length),
        { maintainability: f.maintainability_index, crap: f.crap_max },
      ]),
  );
  const untested = new Set(
    reports.health.coverage_gaps.files
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => f.path.slice(prefix.length)),
  );
  return { scores, untested };
}

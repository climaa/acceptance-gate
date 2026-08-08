// Per-issue and per-run model/effort overrides for the agent roles.
//
// `sandcastle-agent-profiles.mts` pins one model+effort per role for every run,
// which is right as a default but all-or-nothing: there is no way to say "this
// one issue is mechanical, run it on Sonnet" without editing a checked-in file.
// Opus 5 draws from its own rate-limit bucket and this repo has already
// exhausted a model's weekly quota on sandcastle runs (production quota exhaustion), so the
// ability to spend the cheap model on cheap issues is worth a little plumbing.
//
// Resolution order, least to most specific:  PROFILES  <  env  <  issue label
//
// Only `implementer` and `reviewer` can bind per issue. The planner runs once
// per invocation BEFORE any issue exists (main.mts), and the merger runs once
// for every branch at once (sandcastle-merge.mts) — so an `sc:planner:*` label
// on an issue has no coherent binding point and is rejected rather than
// silently ignored.
//
// Deliberately imports NOTHING from this directory, as a layering choice — see
// sandcastle-worktree-safety.mts. `sandcastle-config.mts` is import-safe now
// (its `gh` preflight and turbo-cache log are explicit calls, not import-time
// side effects), so this is no longer a necessity; but keeping it pure is what
// lets the resolution rules get REAL tests against plain strings.

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Role = 'planner' | 'implementer' | 'reviewer' | 'merger';
export type PerIssueRole = 'implementer' | 'reviewer';
export type ProfileOverride = { model?: string; effort?: Effort };

/**
 * Accepted model aliases, and the canonical id each expands to. This map is
 * also the ALLOWLIST: `claudeCode(model)` passes the string straight through to
 * the CLI's `--model` flag with no validation, so an unrecognised value would
 * only surface as a CLI failure deep inside a run that has already cost tokens.
 *
 * `fable-5` is absent on purpose — see the header of
 * sandcastle-agent-profiles.mts: it bills against a separate weekly quota that
 * sandcastle runs exhausted on their own.
 */
export const MODEL_ALIASES: Readonly<Record<string, string>> = {
  'opus-5': 'claude-opus-5',
  'sonnet-5': 'claude-sonnet-5',
};

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

const PER_ISSUE_ROLES: readonly PerIssueRole[] = ['implementer', 'reviewer'];
const RUN_LEVEL_ROLES: readonly Role[] = ['planner', 'merger'];
const ALL_ROLES: readonly Role[] = ['planner', 'implementer', 'reviewer', 'merger'];

/** Every control label starts with this. Nothing else in the repo's label set does. */
export const LABEL_PREFIX = 'sc:';

const canonicalModels = new Set(Object.values(MODEL_ALIASES));

/** Accepts either an alias (`sonnet-5`) or a canonical id (`claude-sonnet-5`). */
function canonicalModel(value: string): string | null {
  if (MODEL_ALIASES[value]) return MODEL_ALIASES[value];
  return canonicalModels.has(value) ? value : null;
}

function knownAliasList(): string {
  return [...Object.keys(MODEL_ALIASES)].sort().join(', ');
}

/**
 * `max` effort is Opus-only (SDK README). Checked against the EFFECTIVE model
 * rather than the label, because effort and model are overridable
 * independently — `sc:implementer:effort:max` alone is legal on top of the
 * Opus default but not on top of an env var that switched to Sonnet.
 */
function effortModelConflict(model: string, effort?: Effort): string | null {
  if (effort !== 'max') return null;
  return model.includes('opus')
    ? null
    : `effort "max" is Opus-only, but the effective model is "${model}"`;
}

/**
 * Parse `sc:`-prefixed labels into per-role overrides.
 *
 * Grammar:
 *   sc:<role>:<model-alias>        e.g. sc:implementer:sonnet-5
 *   sc:<role>:effort:<effort>      e.g. sc:reviewer:effort:xhigh
 *
 * Non-`sc:` labels are ignored. Every malformed control label produces an
 * error string; callers aggregate and fail the run BEFORE spending tokens, so
 * a typo can never silently fall back to the expensive default.
 */
export function parseOverrideLabels(labels: readonly string[]): {
  overrides: Partial<Record<PerIssueRole, ProfileOverride>>;
  errors: string[];
} {
  const overrides: Partial<Record<PerIssueRole, ProfileOverride>> = {};
  const errors: string[] = [];

  for (const label of labels) {
    if (!label.startsWith(LABEL_PREFIX)) continue;

    const parts = label.split(':');
    const role = parts[1] ?? '';

    if (!(ALL_ROLES as readonly string[]).includes(role)) {
      errors.push(
        `${label}: unknown role "${role}" (expected one of ${PER_ISSUE_ROLES.join(', ')})`,
      );
      continue;
    }
    if ((RUN_LEVEL_ROLES as readonly string[]).includes(role)) {
      errors.push(
        `${label}: "${role}" cannot be set per issue — it runs once per invocation, ` +
          `not once per issue. Use SC_${role.toUpperCase()}_MODEL / ` +
          `SC_${role.toUpperCase()}_EFFORT on the \`pnpm sandcastle\` command instead.`,
      );
      continue;
    }

    const key = role as PerIssueRole;
    const current = overrides[key] ?? {};

    if (parts.length === 3 && parts[2] !== 'effort') {
      const model = canonicalModel(parts[2]!);
      if (!model) {
        errors.push(
          `${label}: unknown model "${parts[2]}" (known aliases: ${knownAliasList()})`,
        );
        continue;
      }
      if (current.model && current.model !== model) {
        errors.push(
          `${label}: conflicting model for "${key}" — already set to "${current.model}"`,
        );
        continue;
      }
      overrides[key] = { ...current, model };
      continue;
    }

    if (parts.length === 4 && parts[2] === 'effort') {
      const effort = parts[3] as Effort;
      if (!EFFORTS.includes(effort)) {
        errors.push(
          `${label}: unknown effort "${parts[3]}" (expected one of ${EFFORTS.join(', ')})`,
        );
        continue;
      }
      if (current.effort && current.effort !== effort) {
        errors.push(
          `${label}: conflicting effort for "${key}" — already set to "${current.effort}"`,
        );
        continue;
      }
      overrides[key] = { ...current, effort };
      continue;
    }

    errors.push(
      `${label}: malformed — expected sc:<role>:<model> or sc:<role>:effort:<effort>`,
    );
  }

  return { overrides, errors };
}

/**
 * Run-wide override for one role, read from the host environment. These are
 * consumed host-side when the CLI command is built, so they do NOT need to be
 * in `.sandcastle/.env` and are never injected into a sandbox.
 */
export function envOverride(
  role: Role,
  env: Record<string, string | undefined>,
): { override: ProfileOverride; errors: string[] } {
  const override: ProfileOverride = {};
  const errors: string[] = [];
  const upper = role.toUpperCase();

  const rawModel = env[`SC_${upper}_MODEL`]?.trim();
  if (rawModel) {
    const model = canonicalModel(rawModel);
    if (model) override.model = model;
    else
      errors.push(
        `SC_${upper}_MODEL: unknown model "${rawModel}" (known aliases: ${knownAliasList()})`,
      );
  }

  const rawEffort = env[`SC_${upper}_EFFORT`]?.trim() as Effort | undefined;
  if (rawEffort) {
    if (EFFORTS.includes(rawEffort)) override.effort = rawEffort;
    else
      errors.push(
        `SC_${upper}_EFFORT: unknown effort "${rawEffort}" (expected one of ${EFFORTS.join(', ')})`,
      );
  }

  return { override, errors };
}

/**
 * Fold the layers together: base (PROFILES) < env < label. Returns the
 * effective profile plus any error that only becomes visible once the layers
 * are combined (currently the Opus-only `max` effort rule).
 */
export function mergeProfile(
  base: { model: string; effort?: Effort },
  env: ProfileOverride = {},
  label: ProfileOverride = {},
): { profile: { model: string; effort?: Effort }; errors: string[] } {
  const profile = {
    model: label.model ?? env.model ?? base.model,
    effort: label.effort ?? env.effort ?? base.effort,
  };
  const conflict = effortModelConflict(profile.model, profile.effort);
  return { profile, errors: conflict ? [conflict] : [] };
}

/** One-line "implementer=claude-sonnet-5·high" summary, or null when nothing was overridden. */
export function describeOverride(
  role: Role,
  base: { model: string; effort?: Effort },
  effective: { model: string; effort?: Effort },
): string | null {
  if (effective.model === base.model && effective.effort === base.effort) {
    return null;
  }
  return `${role}=${effective.model}${effective.effort ? `·${effective.effort}` : ''}`;
}

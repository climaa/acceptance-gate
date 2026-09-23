// Per-role agent profile map. Replaces the old flat OPUS_MODEL/SONNET_MODEL
// constants: naming a constant after a model family lies once
// the model on it changes, and a flat constant can't carry effort, so every
// non-planner call site silently inherited the CLI default. Pinning both
// model and effort per role makes cost and capability per phase explicit.
//
// Rationale per role:
//   planner/implementer/reviewer — the judgment-heavy roles → Opus 5.5 ·
//     medium. Opus 5.5 is priced below Opus 5 ($4/$20 vs $5/$25 per MTok),
//     and Anthropic's launch measurements put it at ~40% less cost per task
//     than Opus 5 at its default effort, with >30% faster output. That default
//     is "medium" (one level below Opus 5's "high"); it is pinned here rather
//     than left to the CLI so a changed default can never move cost silently.
//     Fable 5 stays off the table deliberately: it bills against a separate
//     weekly quota that sandcastle runs exhausted on their own (seen as
//     production quota exhaustion). The previous default stays one label
//     away: `sc:implementer:opus-5` (or SC_IMPLEMENTER_MODEL=opus-5 for a
//     whole run) rolls one issue back, and `sc:implementer:effort:high` raises
//     one issue whose implementation quality is the demonstrable bottleneck —
//     raise the default only once that has happened more than once.
//   merger — mechanical gh PR/auto-merge plus a 20-min CI poll loop. Sonnet
//     5 · low keeps the polling cheap.
//
// Build-verify (`pnpm build`) is NOT an agent role — it runs directly via
// runBuildVerify()/sandbox.exec() (@ai-hero/sandcastle 0.12.0), which is
// mechanical work with zero judgment content.
//
// `as const satisfies Record<…, AgentProfile>` keeps literal-type checking:
// a typo like effort: "hgih" or agentFor("planr") fails at compile time.
import * as sandcastle from '@ai-hero/sandcastle';
import {
  type Effort,
  type ProfileOverride,
  type Role,
  envOverride,
  mergeProfile,
} from './sandcastle-model-overrides.mts';

export type { Effort };

export type AgentProfile = {
  model: string;
  effort?: Effort; // omit -> CLI default
};

export const PROFILES = {
  planner: { model: 'claude-opus-5-5', effort: 'medium' },
  implementer: { model: 'claude-opus-5-5', effort: 'medium' },
  reviewer: { model: 'claude-opus-5-5', effort: 'medium' },
  merger: { model: 'claude-sonnet-5', effort: 'low' },
} as const satisfies Record<string, AgentProfile>;

/**
 * Effective profile for `role`: PROFILES < env < label, per
 * sandcastle-model-overrides.mts. `label` is only ever supplied for the two
 * per-issue roles; planner/merger pick up the env layer here with no call-site
 * change, since neither has an issue in scope.
 *
 * Throws on a bad combination (e.g. effort "max" on a non-Opus model). Env
 * values are validated up front by `assertEnvOverridesValid()` so that failure
 * lands before any sandbox is created rather than mid-run.
 */
export function effectiveProfile(role: Role, label: ProfileOverride = {}): AgentProfile {
  const base = PROFILES[role as keyof typeof PROFILES];
  const { override } = envOverride(role, process.env);
  const { profile, errors } = mergeProfile(base, override, label);
  if (errors.length > 0) {
    throw new Error(`Invalid model override for "${role}": ${errors.join('; ')}`);
  }
  return profile;
}

/**
 * Fail the run before it starts if any SC_*_MODEL / SC_*_EFFORT is unusable.
 * Checks the merged result too, not just each value in isolation — e.g.
 * `SC_IMPLEMENTER_EFFORT=max` is fine on the Opus default but not once
 * `SC_IMPLEMENTER_MODEL=sonnet-5` is also set.
 */
export function assertEnvOverridesValid(
  env: Record<string, string | undefined> = process.env,
): void {
  const errors = (Object.keys(PROFILES) as Role[]).flatMap((role) => {
    const { override, errors: envErrors } = envOverride(role, env);
    if (envErrors.length > 0) return envErrors;
    return mergeProfile(PROFILES[role as keyof typeof PROFILES], override).errors;
  });
  if (errors.length > 0) {
    throw new Error(
      `Invalid Sandcastle model override environment:\n  ${errors.join('\n  ')}`,
    );
  }
}

export function agentFor(role: keyof typeof PROFILES, label?: ProfileOverride) {
  const { model, effort } = effectiveProfile(role, label);
  return sandcastle.claudeCode(model, effort ? { effort } : undefined);
}

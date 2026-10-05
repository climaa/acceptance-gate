// Turbo remote-cache credential resolution — pure, unit-tested.
//
// This module imports nothing from this directory (only `dotenv` for parsing).
// sandcastle-config.mts is import-safe now — its `gh` preflight and startup log
// are explicit calls, not import-time side effects — so this is a layering
// choice rather than a hard requirement. Keep it that way: a pure,
// dependency-free module is unit-tested against plain strings instead of
// asserting on source text. Same reasoning as sandcastle-model-overrides.mts.
//
// File I/O lives in the caller. Everything here is a function of its
// arguments, so every branch below is reachable from a test with plain
// strings.

import dotenv from 'dotenv';

export type TurboCacheDisabledReason =
  /** No `.env`, or it carries neither credential. */
  | 'no-credentials'
  /** No usable `.turbo/config.json`, so nothing to verify the team against. */
  | 'no-link'
  /** `.env` names a team that is not this repo's. */
  | 'foreign-team';

export type TurboCache =
  | { readonly enabled: true; readonly token: string; readonly team: string }
  | {
      readonly enabled: false;
      readonly reason: TurboCacheDisabledReason;
      /** The rejected team, for the operator-facing message. Empty when absent. */
      readonly team: string;
    };

/**
 * Read this repo's turbo team out of a `.turbo/config.json` payload.
 *
 * Returns "" for absent, malformed, or teamId-less input — all three mean the
 * same thing to the caller (nothing trustworthy to compare against), and the
 * disabled path treats that as a refusal rather than a pass.
 */
export function parseTurboLink(contents: string | null): string {
  if (!contents) return '';
  try {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== 'object' || parsed === null) return '';
    const teamId = (parsed as { teamId?: unknown }).teamId;
    return typeof teamId === 'string' ? teamId : '';
  } catch {
    return '';
  }
}

/**
 * Decide whether the remote cache may be used, given the repo-root `.env` and
 * this repo's `.turbo/config.json`.
 *
 * Credentials come from the `.env` payload and NOWHERE else — deliberately not
 * from `process.env`. A shell profile that exports another project's
 * TURBO_TEAM applies to every repo on the machine, which is how a personal
 * project ends up writing to an unrelated team's cache. Taking the values as
 * an argument makes that ambient coupling unrepresentable rather than merely
 * lower-precedence.
 *
 * `dotenv.parse` returns a plain object and never mutates `process.env`,
 * unlike `dotenv.config()` or node's `process.loadEnvFile()`.
 *
 * Fails closed: any doubt about which team owns the cache disables it. Writing
 * to the wrong team's cache is unrecoverable; a cold build is merely slow.
 */
export function resolveTurboCache(
  envFileContents: string | null,
  turboLinkContents: string | null,
): TurboCache {
  const fileEnv = envFileContents ? dotenv.parse(envFileContents) : {};
  const team = fileEnv.TURBO_TEAM ?? '';
  const token = fileEnv.TURBO_TOKEN ?? '';
  const expected = parseTurboLink(turboLinkContents);

  if (team === '' || token === '')
    return { enabled: false, reason: 'no-credentials', team };
  if (expected === '') return { enabled: false, reason: 'no-link', team };
  if (team !== expected) return { enabled: false, reason: 'foreign-team', team };

  return { enabled: true, token, team };
}

/** Operator-facing one-liner for the startup log. Never includes the token. */
export function describeTurboCache(cache: TurboCache): string {
  if (cache.enabled) {
    return `[turbo] remote cache enabled (TURBO_TOKEN=${cache.token.length} chars, TURBO_TEAM=${cache.team.length} chars)`;
  }
  switch (cache.reason) {
    case 'no-credentials':
      return '[turbo] remote cache disabled — TURBO_TOKEN/TURBO_TEAM not set in the repo-root .env (run `turbo login && turbo link`, then copy .env.example to .env)';
    case 'no-link':
      return `[turbo] remote cache disabled — no .turbo/config.json to verify TURBO_TEAM="${cache.team}" against (run \`turbo link\`); refusing to write to an unverified team cache`;
    case 'foreign-team':
      return `[turbo] remote cache disabled — .env TURBO_TEAM="${cache.team}" is not this repo's scope; refusing to write to a foreign team cache`;
  }
}

/**
 * Where turbo keeps its local cache inside a worktree sandbox.
 *
 * Not turbo's default. The sandbox's worktree resolves its git directory to
 * the host's path, so turbo puts its cache under a `/Users/...` directory the
 * container cannot create. From 3 to 5 Oct 2026 every implementer's first
 * `git push` failed the gate's turbo checks this way, and each agent recovered
 * by pushing again with this variable set. `BUILD_VERIFY_COMMAND` already set
 * it inline for its own build; this puts it in the sandbox's environment, so
 * the agents' own `pnpm gate` and pre-push runs get it too.
 */
export const SANDBOX_TURBO_CACHE_DIR = '/tmp/turbo-cache';

/**
 * The turbo variables a worktree sandbox runs with: the local cache directory
 * always, the remote-cache credentials only when both were resolved (an empty
 * value is `resolveTurboCache`'s "disabled").
 */
export function sandboxTurboEnv(token: string, team: string): Record<string, string> {
  return {
    TURBO_CACHE_DIR: SANDBOX_TURBO_CACHE_DIR,
    ...(token && team ? { TURBO_TOKEN: token, TURBO_TEAM: team } : {}),
  };
}

// Turbo remote-cache credential resolution — pure, unit-tested.
//
// This module imports nothing from this directory (only `dotenv` for parsing)
// precisely so it can be loaded without dragging in sandcastle-config.mts's
// import-time side effects — the `gh` preflight, the file reads, the startup
// log. Same reasoning as sandcastle-model-overrides.mts. Keep it that way: the
// moment this file needs a local import, its tests have to go back to
// asserting on source text instead of behaviour.
//
// File I/O lives in the caller. Everything here is a function of its
// arguments, so every branch below is reachable from a test with plain
// strings.

import dotenv from "dotenv";

export type TurboCacheDisabledReason =
  /** No `.env`, or it carries neither credential. */
  | "no-credentials"
  /** No usable `.turbo/config.json`, so nothing to verify the team against. */
  | "no-link"
  /** `.env` names a team that is not this repo's. */
  | "foreign-team";

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
  if (!contents) return "";
  try {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null) return "";
    const teamId = (parsed as { teamId?: unknown }).teamId;
    return typeof teamId === "string" ? teamId : "";
  } catch {
    return "";
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
  const team = fileEnv.TURBO_TEAM ?? "";
  const token = fileEnv.TURBO_TOKEN ?? "";
  const expected = parseTurboLink(turboLinkContents);

  if (team === "" || token === "") return { enabled: false, reason: "no-credentials", team };
  if (expected === "") return { enabled: false, reason: "no-link", team };
  if (team !== expected) return { enabled: false, reason: "foreign-team", team };

  return { enabled: true, token, team };
}

/** Operator-facing one-liner for the startup log. Never includes the token. */
export function describeTurboCache(cache: TurboCache): string {
  if (cache.enabled) {
    return `[turbo] remote cache enabled (TURBO_TOKEN=${cache.token.length} chars, TURBO_TEAM=${cache.team.length} chars)`;
  }
  switch (cache.reason) {
    case "no-credentials":
      return "[turbo] remote cache disabled — TURBO_TOKEN/TURBO_TEAM not set in the repo-root .env (run `turbo login && turbo link`, then copy .env.example to .env)";
    case "no-link":
      return `[turbo] remote cache disabled — no .turbo/config.json to verify TURBO_TEAM="${cache.team}" against (run \`turbo link\`); refusing to write to an unverified team cache`;
    case "foreign-team":
      return `[turbo] remote cache disabled — .env TURBO_TEAM="${cache.team}" is not this repo's scope; refusing to write to a foreign team cache`;
  }
}

// Orchestrator configuration — constants shared across the plan/implement/
// build-verify/review/merge phases, plus two import-time side effects (not
// just inert constants): the `process.env.PATH` prepend below and the
// turbo remote-cache startup log both run as soon as this module loads.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// `pnpm sandcastle` spawns scripts in /bin/sh with a minimal PATH that omits
// Homebrew's bin dirs, so `gh` (used by the stranded-branch rescue path) goes
// missing. Prepend the common macOS+Linux install locations so host tools
// resolve regardless of launch context.
process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ""}`;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

// Turbo credentials come from the repo-root `.env` and NOWHERE else.
//
// Deliberately NOT `process.env.TURBO_TOKEN`/`process.env.TURBO_TEAM`: a shell
// profile that exports another project's team (the common case — one
// `export TURBO_TEAM=...` in ~/.bashrc applies to every repo on the machine)
// would otherwise silently send this repo's artifacts to a foreign cache.
// Reading the file directly makes that structurally impossible, rather than
// depending on precedence rules or a CLI flag someone forgets to pass.
//
// `dotenv.parse` returns a plain object and never mutates process.env — unlike
// `dotenv.config()` or node's `process.loadEnvFile()`, both of which write into
// the environment and would reintroduce the ambient coupling this avoids.
//
// Asymmetry worth preserving: the `turbo` binary cannot read `.env` itself
// ("Turborepo does not natively load .env files into a task's runtime"), so
// package.json wraps the turbo scripts in `dotenv -e .env -o --`. This module
// needs no such wrapper — do not "simplify" it back onto process.env.
//
// .env injection caveat: the @ai-hero/sandcastle package's `resolveEnv` parses
// `.sandcastle/.env` and injects every key PRESENT there into every sandbox.
// Keep TURBO_TOKEN/TURBO_TEAM ABSENT from `.sandcastle/.env` so a stale copy
// cannot shadow the values threaded via `docker({ env })` at the two
// build-verify call sites. (`.sandcastle/.env` is gitignored — documentable,
// not enforceable.)
const rootEnv = readIfPresent(path.join(REPO_ROOT, ".env"));
const fileEnv = rootEnv ? dotenv.parse(rootEnv) : {};

// The expected team is this repo's own turbo link (`.turbo/config.json` —
// gitignored, written by `turbo link`), never a literal in tracked source.
// Hardcoding it published an account identifier in a public repo; deriving it
// keeps provenance out of git entirely and survives an account change with no
// code edit. Absent or unparseable => no expected team => cache disabled.
//
// Caveat: `turbo` REWRITES `.turbo/config.json` from whatever TURBO_TEAM it
// sees, so a bare `turbo run ...` with a foreign team exported would re-point
// this reference. That is why every turbo script in package.json is wrapped in
// `dotenv -e .env -o --`: turbo then only ever sees the root `.env` values and
// the link file stays in agreement with them. Invoke turbo through the pnpm
// scripts, not directly.
const turboLink = readIfPresent(path.join(REPO_ROOT, ".turbo", "config.json"));
let expectedTurboTeam = "";
try {
  expectedTurboTeam = turboLink ? (JSON.parse(turboLink).teamId ?? "") : "";
} catch {
  expectedTurboTeam = "";
}

const rawTurboTeam = fileEnv.TURBO_TEAM ?? "";
const foreignTeam =
  rawTurboTeam !== "" &&
  (expectedTurboTeam === "" || rawTurboTeam !== expectedTurboTeam);
export const turboToken = foreignTeam ? "" : (fileEnv.TURBO_TOKEN ?? "");
export const turboTeam = foreignTeam ? "" : rawTurboTeam;
if (foreignTeam) {
  console.log(
    expectedTurboTeam === ""
      ? `[turbo] remote cache disabled — no .turbo/config.json to verify TURBO_TEAM="${rawTurboTeam}" against (run \`turbo link\`); refusing to write to an unverified team cache`
      : `[turbo] remote cache disabled — .env TURBO_TEAM="${rawTurboTeam}" is not this repo's scope; refusing to write to a foreign team cache`,
  );
} else if (turboToken && turboTeam) {
  console.log(
    `[turbo] remote cache enabled (TURBO_TOKEN=${turboToken.length} chars, TURBO_TEAM=${turboTeam.length} chars)`,
  );
} else {
  console.log(
    "[turbo] remote cache disabled — TURBO_TOKEN/TURBO_TEAM not set in the repo-root .env (run `turbo login && turbo link`, then copy .env.example to .env)",
  );
}

// Base branch the orchestrator merges into. Used to detect whether a
// sandcastle/* branch has work ready to merge, regardless of which run
// produced the commits.
export const BASE_BRANCH = "main";

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
export const MAX_ITERATIONS = 10;

// Hooks run inside the sandbox before the agent starts each iteration.
// npm install ensures the sandbox always has fresh dependencies.
//
// Git credential helper: GH_TOKEN in the sandbox env is enough
// for `gh` CLI commands, but plain `git push` won't authenticate from it
// without a credential helper wired up. This bites the merger phase, whose
// fallback push runs `git push` directly. `gh auth setup-git` configures the
// helper (`credential.https://github.com.helper '!gh auth git-credential'`),
// but it must run here at runtime — GH_TOKEN isn't available at docker build
// time, so it can't live as a Dockerfile RUN. Gated on GH_TOKEN so it's a
// no-op (not an error) in environments where the token isn't set.
//
// CI=true: the sandbox exec has no TTY, so a node_modules state that pnpm
// wants to purge-and-reinstall (e.g. a differing store/HOME between host and
// container) hits pnpm's interactive "confirm removal" prompt and aborts
// non-interactively with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. CI=true
// auto-confirms, matching how the host pre-push hook already runs installs.
export const hooks = {
  sandbox: {
    onSandboxReady: [
      {
        command: 'if [ -n "$GH_TOKEN" ]; then gh auth setup-git; fi',
        timeoutMs: 60_000,
      },
      { command: "CI=true pnpm install", timeoutMs: 600_000 },
    ],
  },
};

# Sandcastle — Orchestrator Guide

Sandcastle is an autonomous multi-agent system that reads the open GitHub issue
backlog, plans which issues can run in parallel, implements them in isolated
Docker sandboxes, reviews the result, and opens PRs into `main`.

---

## Running it

```bash
# From the repo root (preferred)
pnpm sandcastle

# Or directly
npx tsx .sandcastle/main.mts
```

Both forms run `main.mts` and iterate until the backlog is clear (or
`MAX_ITERATIONS` is reached, default 10).

---

## Four-phase loop

Each iteration executes in order:

| Phase       | Agent          | Prompt file                      | What it does                                                                              |
| ----------- | -------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 1 Plan      | Opus 5 · high  | `agent-docs/plan-prompt.md`      | Reads open issues, builds a dependency graph, outputs a `<plan>` JSON of unblocked issues |
| 2 Implement | Opus 5 · high  | `agent-docs/implement-prompt.md` | Writes code, tests, and commits on the issue branch                                       |
| 3 Review    | Opus 5 · high  | `agent-docs/review-prompt.md`    | Checks the branch for correctness/style; may push fixup commits                           |
| 4 Merge     | Sonnet 5 · low | `agent-docs/merge-prompt.md`     | Opens a PR per branch, enables squash auto-merge, waits for CI, closes the issue          |

Model and effort per role are pinned in `sandcastle-agent-profiles.mts` — that
file is the source of truth; this table mirrors it.

Implement + Review share one Docker sandbox per issue. All issue pipelines
run serially (concurrent `pnpm install` was observed to deadlock on pnpm 10.x;
see #448).

### Overriding the model per issue or per run

Resolution order is **`PROFILES` < env var < issue label**. Rules live in
`sandcastle-model-overrides.mts` (pure, unit-tested).

Labels bind **per issue**, and only for `implementer` / `reviewer` — the planner
runs once before any issue exists and the merger runs once for all branches, so
`sc:planner:*` / `sc:merger:*` on an issue is a hard error, not a no-op. Env vars
bind **per run**, for any role:

```bash
gh issue edit 2079 --add-label "sc:implementer:sonnet-5"   # per issue
SC_PLANNER_MODEL=sonnet-5 SC_MERGER_EFFORT=medium pnpm sandcastle   # per run
```

Accepted models are `opus-5` / `sonnet-5` (aliases or canonical ids); efforts are
`low|medium|high|xhigh|max`, with `max` Opus-only. Anything else **fails the run
before a sandbox is created** — a typo must never silently fall back to the
expensive default. `gh issue edit --add-label` also refuses labels that do not
exist, which is a second, free typo guard. The vocabulary is already created; to
recreate it, note the braces — in zsh `"$r:effort"` is parsed as a `:e` modifier
and silently produces `sc:ffort:…`:

```bash
for r in implementer reviewer; do
  for e in low medium high xhigh max; do
    gh label create "sc:${r}:effort:${e}" --color D4C5F9 --description "Sandcastle effort override"
  done
done
```

---

## Branch-name format

The planner always assigns branches in the form:

```
sandcastle/issue-{id}-{slug}
```

Example: `sandcastle/issue-475-sandcastle-readme`

`main.mts` parses this format to map branches back to issue IDs when rescuing
stranded branches.

---

## Completion-signal convention

Every agent (implementer, reviewer, merger) outputs the literal string:

```
<promise>COMPLETE</promise>
```

as its final line. Sandcastle's SDK watches stdout for this token to know the
agent has finished cleanly. If background processes are still running when the
signal fires, the detector misses it and the idle timer kills the run
instead — which means the branch may be stranded and the issue left open.

**This is why all prompt files explicitly forbid `run_in_background: true`**
(added in #468). Agents must poll with foreground loops
(`while sleep 30; do …; done`) instead.

### Per-phase `idleTimeoutSeconds` budgets

Each `sandcastle.run`/`sandbox.run` call in `main.mts` sets an explicit
`idleTimeoutSeconds` to avoid mid-run crashes (issue #565):

| Phase       | `idleTimeoutSeconds` | Rationale                                                                   |
| ----------- | -------------------- | --------------------------------------------------------------------------- |
| Planner     | 600                  | Fast, emits output continuously; 10 min is sufficient                       |
| Implementer | 1200                 | Slow `pnpm install` + test runs can take up to 20 min on the slow path      |
| Reviewer    | 1200                 | Same budget as implementer — file reading can run for several minutes       |
| Merger      | 1800                 | Auto-merge poll loop: 30 s × 40 iterations = up to 20 min, plus CI overhead |

The merger gets the largest budget because its poll loop (`seq 1 40; sleep 30`)
can run silently for the full 20-minute window. Each iteration echoes its state
(`echo "poll $i: state=$PR_STATE"`) to keep the idle detector from firing early.

---

## No `run_in_background` rule

Prompt files carry this block (added in #468 to fix stranded-branch failures):

> **Do not use `run_in_background: true` for any bash call.** Poll with
> foreground loops so this process holds no open background handles when you
> emit `<promise>COMPLETE</promise>`. Sandcastle's completion-signal detector
> misses the signal if background tasks are pending.

The test at `apps/web/src/__tests__/sandcastle-no-background-bash.test.ts`
enforces this in CI.

---

## `.env` setup

Copy `.env.example` to `.env` and fill in:

| Variable                  | Purpose                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Authenticates the Claude Code CLI inside Docker sandboxes. Use your Claude subscription token (OAuth) or an API key — see the comment in `.env.example`. |
| `GH_TOKEN`                | GitHub PAT used by the `gh` CLI for reading issues, opening PRs, and merging. Needs `repo` scope.                                                        |

`.env` is gitignored — never commit it.

---

## Gitignored paths

Two directories are created at runtime and are listed in `.gitignore`:

- `logs/` — per-run agent stdout captured by the SDK
- `worktrees/` — Docker bind-mount paths for each sandbox

Delete them freely; they are regenerated on the next run.

---

## CODING_STANDARDS.md

`agent-docs/CODING_STANDARDS.md` is loaded by the **reviewer** agent
(not a generic style doc). It codifies repo-specific conventions that static
analysis cannot catch — naming patterns, test structure, commit-message format,
etc. Update it when a repeated review comment reveals a convention gap.

---

## Stranded branches

If the merge phase crashes mid-run (network drop, sandbox OOM), a branch may
be left ahead of `main` with no open PR. On the next run, `main.mts`
detects these via `collectStrandedIssues()` (in `sandcastle-stranded-branches
.mts`) and feeds them directly to the merger — no manual intervention needed
for the common case.

If branches accumulate anyway:

1. Run `git branch | grep sandcastle/` to list them.
2. `gh issue view <ID>` — if the issue is **closed**, the branch is stale and
   can be deleted: `git branch -D sandcastle/issue-<ID>-*`.
3. If the issue is still open and the branch has commits ahead of `main`,
   re-run `pnpm sandcastle` — the rescue path will pick it up.

---

## Prior art / debugging trail

| Ref  | What changed                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------ |
| #345 | Initial Sandcastle orchestrator                                                                        |
| #420 | Docker sandbox wiring                                                                                  |
| #448 | Serialised issue execution (fixed pnpm 10 parallel-install deadlock)                                   |
| #468 | Forbade `run_in_background` in all three agent prompts; fixed stranded-branch signal-detection failure |

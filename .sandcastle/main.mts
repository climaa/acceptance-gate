// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             The planner agent (PROFILES.planner) analyzes
//                               open issues, builds a dependency graph, and
//                               outputs a <plan> JSON listing unblocked
//                               issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox() (see sandcastle-run-issue.mts).
//                               The implementer runs first (100 iterations).
//                               If it produces commits, build-verify then a
//                               reviewer run in the same sandbox on the same
//                               branch. Issue pipelines run serially via a
//                               sequential for…await loop — concurrent pnpm
//                               installs deadlock on pnpm 10.x;
//                               failures are caught per-issue so the rest
//                               continue.
//   Phase 3 (Merge):            A single agent (sandcastle-merge.mts) merges
//                               all completed branches into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// The orchestrator's mechanics are split across sibling `sandcastle-*.mts`
// files by concern (config, agent profiles, git/gh queries, build-verify,
// stranded-branch rescue, the merge phase, the per-issue pipeline, and
// lifecycle/retry helpers) — this file is just the composition root: startup
// wiring plus the plan→execute→merge loop.
//
// Usage:
//   npx tsx .sandcastle/main.mts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import { execSync } from "node:child_process";
import { BASE_BRANCH, MAX_ITERATIONS } from "./sandcastle-config.mts";
import { headHooks } from "./sandcastle-sandbox-hooks.mts";
import {
  agentFor,
  assertEnvOverridesValid,
  effectiveProfile,
} from "./sandcastle-agent-profiles.mts";
import {
  describeOverride,
  parseOverrideLabels,
} from "./sandcastle-model-overrides.mts";
import { installGracefulShutdown, reapExitedContainers } from "./sandcastle-lifecycle.mts";
import { ensureImageFreshness } from "./sandcastle-image-freshness.mts";
import {
  type IssueRef,
  branchHasCommitsAhead,
  fetchIssue,
  markIssueNoOp,
} from "./sandcastle-git.mts";
import {
  NOOP_LABEL,
  hasNoOpLabel,
  noOpIssueComment,
  partitionOutcomes,
} from "./sandcastle-noop-issues.mts";
import { collectStrandedIssues, verifyStrandedBranches } from "./sandcastle-stranded-branches.mts";
import { runMerger } from "./sandcastle-merge.mts";
import { runIssue } from "./sandcastle-run-issue.mts";
import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

// ---------------------------------------------------------------------------
// Orchestrator startup (a partial port of an earlier single-runner variant)
// ---------------------------------------------------------------------------

// Graceful shutdown. Declared here so every phase — planner, runIssue()'s
// implementer/build-verify/reviewer, and runMerger() — threads the same
// `abortSignal` into its sandcastle.run / sandbox.run call. The first
// SIGINT/SIGTERM stops *starting* new sandbox work; runs already in flight
// reject with the signal's reason but still hit their `finally { sandbox.close() }`
// cleanup, so no container is orphaned. A second Ctrl-C force-quits (see
// installGracefulShutdown).
const { signal: abortSignal } = installGracefulShutdown();

// Run-wide model overrides (SC_<ROLE>_MODEL / SC_<ROLE>_EFFORT) are validated
// here rather than at first use, so an unusable value fails before any
// container starts instead of midway through the batch.
assertEnvOverridesValid();

// Reap `status=exited` sandbox containers stranded by a previously-killed run,
// once at startup (mirrors the single-runner preflight). Scoped to this repo's image
// and to exited-only so a concurrently-running `pnpm sandcastle` invocation's
// live containers are never touched. Not run per-issue: the sandbox `finally`
// blocks already close sandboxes, so per-attempt reaping would be redundant.
reapExitedContainers();

// Image-freshness guard. The docker() factory reuses whatever is
// already tagged `sandcastle:<checkout-dirname>`; editing `.sandcastle/Dockerfile`
// (e.g. bumping the global pnpm) does NOT invalidate that tag. On 2026-07-25 a
// stale image ran the whole batch against pnpm 11.15.1 while the repo pinned
// 11.17.0, hard-failing every container's pre-push version check as phantom
// per-workspace failures. Verify the running image's pnpm matches
// package.json#packageManager and rebuild on drift (or a missing image) BEFORE
// any agent starts; refuse to start (throw) if a rebuild can't reconcile it,
// rather than run the batch against the wrong toolchain and report ten
// independent "push failed" comments.
ensureImageFreshness();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// Ids of issues this run has already found nothing to do on. Run-scoped on
// purpose: declared inside the loop it would reset every iteration, which is
// exactly the bug — the planner keeps proposing a no-op issue and each
// iteration spends a sandbox on it. The durable half of the mark is NOOP_LABEL
// on the issue itself; this set is what still works when `gh` is unavailable.
const noOpIssueIds = new Set<string>();

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  // Graceful shutdown: a SIGINT/SIGTERM between iterations stops
  // the orchestrator from starting a fresh Plan→Execute→Merge cycle. Work
  // already in flight in the previous iteration ran its own cleanup before
  // control returned here.
  if (abortSignal.aborted) {
    console.log("\nShutdown requested — stopping before the next iteration.");
    break;
  }
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent (see PROFILES.planner) reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — we parse that to drive Phase 2.
  // -------------------------------------------------------------------------
  const plan = await sandcastle.run({
    // headHooks, NOT worktreeHooks — no startup `pnpm install`, because of the
    // bind mount described just below. See sandcastle-sandbox-hooks.mts.
    hooks: headHooks,
    // HEAD-mode sandbox: bind-mounts the host checkout at /home/agent/workspace,
    // so any in-container pnpm run touches the host's node_modules. Belt-and-braces
    // env guard suppresses pnpm 11's automatic pre-run deps verification (which
    // would auto-`pnpm install` and ping-pong host↔container pnpm state — a known host↔container ping-pong,
    // a prior production fix). Must be the `pnpm_config_` prefix: `npm_config_verify_deps_before_run`
    // does NOT suppress pnpm 11's verify; `pnpm_config_verify_deps_before_run=false`
    // does. Covers agents operating before/without the pnpm-workspace.yaml setting.
    sandbox: docker({ env: { pnpm_config_verify_deps_before_run: "false" } }),
    name: "planner",
    idleTimeoutSeconds: 600,
    signal: abortSignal,
    // One iteration is enough: the planner just needs to read and reason,
    // not write code.
    maxIterations: 1,
    // Model + effort live in PROFILES.planner — judgment-heavy reasoning at
    // effort "high" (xhigh would draw more thinking tokens from the shared
    // Max quota for no measurable plan-quality gain).
    agent: agentFor("planner"),
    promptFile: "./.sandcastle/agent-docs/plan-prompt.md",
  });

  // Extract the <plan>…</plan> block from the agent's stdout.
  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!planMatch) {
    throw new Error(
      "Planning agent did not produce a <plan> tag.\n\n" + plan.stdout,
    );
  }

  // The plan JSON contains an array of issues, each with id, title, branch.
  const { issues: planned } = JSON.parse(planMatch[1]!) as {
    issues: IssueRef[];
  };

  // One pass over the plan, deciding two things from each issue's labels —
  // both BEFORE any sandbox is created:
  //
  //   1. Is the issue still eligible? An issue already marked no-op is dropped
  //      here rather than run again. The planner is told to skip them too
  //      (agent-docs/plan-prompt.md), but a mechanism that stops a run from
  //      burning MAX_ITERATIONS on one issue must not depend on an agent
  //      obeying a prompt.
  //   2. Its model/effort overrides (sandcastle-model-overrides.mts). A typo'd
  //      control label costs nothing here: a label that does not parse must
  //      never silently fall back to the expensive default.
  const issues: IssueRef[] = [];
  const overrideErrors: string[] = [];
  for (const issue of planned) {
    const labels = fetchIssue(issue.id)?.labels ?? [];
    if (noOpIssueIds.has(issue.id) || hasNoOpLabel(labels)) {
      noOpIssueIds.add(issue.id);
      console.log(
        `  ⏭ #${issue.id} skipped: an earlier run produced no changes (${NOOP_LABEL}). ` +
          `Remove the label to queue it again.`,
      );
      continue;
    }
    const { overrides, errors } = parseOverrideLabels(labels);
    if (errors.length > 0) {
      overrideErrors.push(...errors.map((e) => `  #${issue.id}  ${e}`));
      continue;
    }
    if (Object.keys(overrides).length > 0) issue.overrides = overrides;
    issues.push(issue);
  }
  if (overrideErrors.length > 0) {
    throw new Error(
      `Invalid Sandcastle model-override label(s):\n${overrideErrors.join("\n")}`,
    );
  }

  if (issues.length === 0) {
    // Nothing eligible — either the planner found no unblocked work, or every
    // issue it proposed is already marked no-op. Prior runs may still have left
    // branches with commits ahead of main and no PR (e.g. previous reviewer
    // crashed mid-pipeline). Rescue them directly into the merge phase before
    // exiting, otherwise the orchestrator declares done with stranded work.
    const stranded = collectStrandedIssues(new Set());
    if (stranded.length === 0) {
      console.log(
        planned.length > 0
          ? "Every planned issue is already marked no-op. Exiting."
          : "No unblocked issues to work on. Exiting.",
      );
      break;
    }
    console.log(
      `\nNo unblocked issues in plan, but found ${stranded.length} stranded branch(es) to rescue:`,
    );
    for (const s of stranded) {
      console.log(`  ${s.branch} (#${s.id})`);
    }
    // A crashed prior run is exactly the case where the branch's build state is
    // unknown — build-verify each rescued branch before merging (build-gate hardening).
    const verified = await verifyStrandedBranches(stranded, abortSignal);
    if (verified.length === 0) {
      console.log("No rescued branches passed build-verify. Exiting.");
      break;
    }
    await runMerger(verified, abortSignal);
    console.log("\nStranded branches merged.");
    continue;
  }

  console.log(
    `Planning complete. ${issues.length} issue(s) to run serially ` +
      `(concurrent sandbox \`pnpm install\` deadlocks on pnpm 10.x — see sandcastle-run-issue.mts for context):`,
  );
  for (const issue of issues) {
    // Name the effective model whenever it differs from the pinned default, so
    // the run log is the record of what each issue actually cost.
    const overridden = (["implementer", "reviewer"] as const)
      .map((role) =>
        describeOverride(
          role,
          effectiveProfile(role),
          effectiveProfile(role, issue.overrides?.[role]),
        ),
      )
      .filter((d): d is string => d !== null);
    const suffix = overridden.length > 0 ? `  [${overridden.join(" ")}]` : "";
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}${suffix}`);
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review — see sandcastle-run-issue.mts for the per-issue
  // pipeline. Issues run serially: concurrent `pnpm install` in parallel
  // sandboxes was observed to deadlock on pnpm 10.x (multiple containers
  // stalled in epoll_wait with zero filesystem progress past the first
  // second). One failing pipeline still doesn't stop the rest — failures are
  // caught and recorded so later issues continue.
  // -------------------------------------------------------------------------

  const settled: PromiseSettledResult<Awaited<ReturnType<typeof runIssue>>>[] =
    [];
  for (const issue of issues) {
    // Graceful shutdown: stop picking up the next issue once an
    // abort is requested. The current issue (if any) already finished its
    // `finally { sandbox.close() }` before we got here; remaining issues are
    // simply not started, so their branches stay untouched rather than
    // half-implemented. runIssue() also self-guards via throwIfAborted().
    if (abortSignal.aborted) {
      console.log(
        "  Shutdown requested — skipping remaining issues this iteration.",
      );
      break;
    }
    try {
      settled.push({
        status: "fulfilled",
        value: await runIssue(issue, abortSignal),
      });
    } catch (reason) {
      settled.push({ status: "rejected", reason });
    }
  }

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      console.error(
        `  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`,
      );
    }
  }

  // Split this iteration's results into work to land, issues that produced
  // nothing, and pipelines that threw. The classification rules and the
  // reasoning behind them live in sandcastle-noop-issues.mts.
  const {
    completed: completedIssues,
    noop: noOpThisIteration,
    failed,
  } = partitionOutcomes(
    settled.map((outcome, i) => {
      const issue = issues[i]!;
      return {
        issue,
        status: outcome.status,
        commitCount:
          outcome.status === "fulfilled" ? outcome.value.commits.length : 0,
        // Branch-vs-base rather than just this run's commits, so an idempotent
        // re-run of already-committed work still reaches the merge phase
        // instead of looping forever.
        branchAhead: branchHasCommitsAhead(issue.branch),
      };
    }),
  );
  const failedBranches = failed.map((issue) => issue.branch);

  // Mark the no-ops. Without this the issue stays open and unremarkable, the
  // next iteration's planner proposes it again, and the run spends a fresh
  // sandbox on it every iteration up to MAX_ITERATIONS — the whole reason this
  // path exists. Deliberately a comment plus a label, never a close: "nothing
  // to do" can also mean the agent misread the task.
  for (const issue of noOpThisIteration) {
    noOpIssueIds.add(issue.id);
    const { commented, labeled } = markIssueNoOp(
      issue.id,
      noOpIssueComment({ id: issue.id, branch: issue.branch, iteration }),
    );
    console.log(
      `  ⊘ #${issue.id} produced no changes — left open, excluded from re-planning ` +
        `(comment ${commented ? "posted" : "FAILED"}, ${NOOP_LABEL} ${labeled ? "added" : "FAILED"}).`,
    );
  }

  // Rescue: sandcastle/* branches that are ahead of base but weren't part
  // of this iteration's plan (the planner skips already-implemented ones
  // on the assumption the merger will land them — see agent-docs/plan-prompt.md).
  // If a previous iteration's merge phase crashed or was interrupted,
  // such branches would otherwise be stranded forever.
  //
  // `failedBranches` is listed here to EXCLUDE it from that rescue: a
  // just-failed pipeline's branch is ahead of base with no PR, so it would
  // otherwise re-enter here and merge in the same run it failed, making the
  // build gate advisory-only (build-gate hardening).
  const queuedBranches = new Set([
    ...completedIssues.map((i) => i.branch),
    ...failedBranches,
  ]);
  const stranded = collectStrandedIssues(queuedBranches);
  if (stranded.length > 0) {
    console.log(
      `\nFound ${stranded.length} stranded branch(es) ahead of ${BASE_BRANCH} not in this iteration's plan:`,
    );
    for (const s of stranded) {
      console.log(`  ${s.branch} (#${s.id})`);
    }
    // Build-verify rescued branches before merging — a crashed prior run is
    // exactly when the branch's build state is unknown (build-gate hardening). Failing
    // branches are logged and skipped, staying stranded for human attention.
    const verified = await verifyStrandedBranches(stranded, abortSignal);
    completedIssues.push(...verified);
  }

  const completedBranches = completedIssues.map((i) => i.branch);

  console.log(
    `\nExecution complete. ${completedBranches.length} branch(es) with commits:`,
  );
  for (const branch of completedBranches) {
    console.log(`  ${branch}`);
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log("No commits produced. Nothing to merge.");
    continue;
  }

  // -------------------------------------------------------------------------
  // Trigger CI from the host before opening PRs.
  //
  // The merger runs inside a GitHub-isolated sandbox: it clones from a local
  // git bundle (syncIn) and the agent's commits sync back to the host via
  // patches (syncOut: `git format-patch` + `git am`). A branch reaching GitHub
  // through that sandbox path does NOT trigger GitHub Actions, so the PR the
  // merger opens lands with no required checks and sits BLOCKED forever under
  // the strict, no-bypass branch ruleset — auto-merge can never complete.
  //
  // Pushing each branch to GitHub from the HOST (real `origin`, classic PAT)
  // DOES trigger Actions. Doing it here, before runMerger, means the PR is
  // opened on a branch whose required checks are already running, so auto-merge
  // lands it without any manual nudge. The commits are already on the host
  // branch via syncOut, so this is a normal push. Failures are non-fatal — the
  // merger still attempts its own push — so one bad branch doesn't block the rest.
  // -------------------------------------------------------------------------
  for (const { branch } of completedIssues) {
    try {
      console.log(`[ci-trigger] pushing ${branch} to origin from host`);
      execSync(`git push origin ${branch}`, { stdio: "inherit" });
    } catch (err) {
      console.warn(
        `  ⚠ host push of ${branch} failed (merger will retry its own push): ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge — see sandcastle-merge.mts. GitHub handles ordering via
  // PRs; no local merge into main.
  // -------------------------------------------------------------------------
  await runMerger(completedIssues, abortSignal);

  console.log("\nBranches merged.");
}

console.log("\nAll done.");

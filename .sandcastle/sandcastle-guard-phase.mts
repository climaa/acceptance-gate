// Guard a single awaited orchestration phase so one thrown phase does not kill
// the whole run.
//
// The loop in main.mts awaits the planner, the stranded-branch rescue, and the
// merger at top level. Before this, any of those throwing (a network blip, a
// sandbox crash) aborted the entire process — and the merger case is the worst:
// it runs AFTER completed branches are pushed to origin, so a throw there left
// branches published with no PRs and the orchestrator dead, unable to open them.
//
// guardPhase turns a throw into a value the caller can branch on. It captures
// whether the abort signal had fired BY THE TIME the phase failed (read in the
// catch, not before), so the caller can tell a graceful SIGINT-driven shutdown
// (exit 0, stop) apart from a real failure (record a non-zero exit, let the loop
// continue — the next iteration's stranded-branch rescue re-verifies and merges
// any already-pushed branches). Logging, process.exitCode, and the break/continue
// choice stay at the call site, where the loop's control flow lives.
//
// Imports nothing on purpose, so loading it drags in no side effects, and the
// try/catch + abort-capture contract is unit-testable without running the loop.

export type PhaseResult<T> =
  { ok: true; value: T } | { ok: false; aborted: boolean; error: unknown };

export async function guardPhase<T>(
  phase: () => Promise<T>,
  isAborted: () => boolean,
): Promise<PhaseResult<T>> {
  try {
    return { ok: true, value: await phase() };
  } catch (error) {
    return { ok: false, aborted: isAborted(), error };
  }
}

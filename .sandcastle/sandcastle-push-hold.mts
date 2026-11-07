// A failed host push holds its issue — for the rest of the run, and after it.
//
// The host `[ci-trigger]` push runs the pre-push gate. When it refuses a
// branch, nothing in the run can fix that: the merger's container retries the
// same push against the same gate and fails it again, and the next iteration's
// planner sees an open, unlabelled issue and dispatches it from scratch on top
// of a branch that already holds the work. A run went on that way until an
// operator stopped it by hand.
//
// So a refused push gets the treatment a no-op gets (sandcastle-noop-issues.mts),
// with the pause label instead of the no-op one: the issue joins a run-scoped
// set the plan screen skips, and gets HOLD_LABEL plus one comment naming the
// failed gate checks and the branch. The label is what keeps a later run off it
// until a human lifts it; the set is what still works when `gh` is down.
//
// The held branch is also kept from the merger: its push would meet the same
// gate, and a second comment saying so adds nothing to the first.
//
// Pure apart from the IO it is handed, and imports only the side-effect-free
// label module, so the tests load it directly.

import { HOLD_LABEL } from './sandcastle-noop-issues.mts';

/** What a host push reported: whether it landed, and what it printed. */
export type PushResult = { ok: boolean; output: string };

/** One issue this run held because its branch's host push failed. */
export type PushHold = { id: string; branch: string; checks: string[] };

// Escape sequences turbo and the gate may colour their lines with.
const ANSI = /\x1b\[[0-9;]*m/g;

/**
 * The gate checks a push's output says failed. The gate ends a failed run with
 * `✗ gate (<tier>) — a, b`; when that line is missing (a hook killed partway)
 * the per-check `✗ <name> — <why>` lines are read instead. Empty when the push
 * failed outside the gate — a rejected ref, a network error.
 */
export function failedGateChecks(output: string): string[] {
  const text = output.replace(ANSI, '');
  const summary = /^✗ gate \([^)]*\) — (.+)$/m.exec(text);
  if (summary) return summary[1]!.split(',').map((name) => name.trim());
  const perCheck = [...text.matchAll(/^✗ (\S+) — /gm)].map((m) => m[1]!);
  return [...new Set(perCheck.filter((name) => name !== 'gate'))];
}

// The end of the push's output, for the reader who wants more than the names.
const TAIL_LINES = 30;

function outputTail(output: string): string {
  const lines = output.replace(ANSI, '').trimEnd().split('\n');
  // A fence inside the output would close the comment's own block early.
  return lines.slice(-TAIL_LINES).join('\n').replaceAll('```', "'''");
}

/**
 * The one comment a held issue gets. It answers what failed, on which branch,
 * why the run stopped working it, and how to put it back in the queue.
 */
export function pushHoldComment({
  id,
  branch,
  iteration,
  checks,
  output,
}: {
  id: string;
  branch: string;
  iteration: number;
  checks: readonly string[];
  output: string;
}): string {
  const finding =
    checks.length > 0
      ? `The pre-push gate failed on ${checks.map((c) => `\`${c}\``).join(', ')}.`
      : 'The push failed without naming a gate check — read the output below.';
  return [
    `**Sandcastle: host push failed** (iteration ${iteration})`,
    '',
    `The host push of \`${branch}\` was refused. ${finding}`,
    '',
    `The branch holds the work, so the run stopped dispatching this issue rather ` +
      `than start it again from scratch. It is labelled \`${HOLD_LABEL}\` so a ` +
      `later run skips it too. Fix the branch, push it from the host, then:`,
    '',
    '```bash',
    `gh issue edit ${id} --remove-label "${HOLD_LABEL}"`,
    '```',
    '',
    '<details><summary>End of the push output</summary>',
    '',
    '```text',
    outputTail(output),
    '```',
    '',
    '</details>',
  ].join('\n');
}

/**
 * Push each ref from the host and hold every one whose push fails: record it in
 * `holds` (the run-scoped exclusion the plan screen reads) and comment and label
 * the issue. Returns the refs that pushed — the only ones the merger should get.
 */
export async function pushOrHold<T extends { id: string; branch: string }>(
  refs: readonly T[],
  io: {
    push: (branch: string) => Promise<PushResult>;
    hold: (id: string, body: string) => { commented: boolean; labeled: boolean };
  },
  run: { iteration: number; holds: Map<string, PushHold> },
): Promise<T[]> {
  const pushed: T[] = [];
  for (const ref of refs) {
    const result = await io.push(ref.branch);
    if (result.ok) {
      pushed.push(ref);
      continue;
    }
    const checks = failedGateChecks(result.output);
    run.holds.set(ref.id, { id: ref.id, branch: ref.branch, checks });
    const { commented, labeled } = io.hold(
      ref.id,
      pushHoldComment({
        ...ref,
        iteration: run.iteration,
        checks,
        output: result.output,
      }),
    );
    console.warn(
      `  ⏸ #${ref.id} host push of ${ref.branch} failed` +
        `${checks.length > 0 ? ` (${checks.join(', ')})` : ''} — held, kept from the merger ` +
        `(comment ${commented ? 'posted' : 'FAILED'}, ${HOLD_LABEL} ${labeled ? 'added' : 'FAILED'}).`,
    );
  }
  return pushed;
}

/**
 * The end-of-run summary: the issues the run set aside, each under its reason.
 * Null when there were none, so the caller logs only when there is something.
 */
export function formatRunSummary(input: {
  noOpIds: Iterable<string>;
  holds: Iterable<PushHold>;
}): string | null {
  const noOp = [...input.noOpIds].map((id) => `  #${id}`);
  const held = [...input.holds].map(
    (h) =>
      `  #${h.id} (${h.branch})` +
      (h.checks.length > 0 ? ` — ${h.checks.join(', ')}` : ''),
  );
  const sections = [
    ...(noOp.length > 0 ? ['no-op:', ...noOp] : []),
    ...(held.length > 0 ? ['push failed — held:', ...held] : []),
  ];
  return sections.length > 0 ? `\nRun summary:\n${sections.join('\n')}` : null;
}

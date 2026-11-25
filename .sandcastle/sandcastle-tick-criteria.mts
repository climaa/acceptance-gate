// The merger's Step 5: reconcile a merged issue's criteria, then close it.
//
//   node .sandcastle/sandcastle-tick-criteria.mts <issue> <pr>
//
// Plain node, which strips the types itself: the merger's head-mode sandbox
// mounts the host's node_modules, whose tsx may carry another OS's esbuild.
// So this file and the one it imports use erasable TypeScript only.
//
// Reads both bodies with `gh`, writes the issue body back only when
// tickIssueCriteria() changed it, and prints the closing comment on stdout for
// the merger's `gh issue comment`. It never closes the issue itself:
// merge-prompt.md keeps that one command, so a failure here still closes it.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closingComment, tickIssueCriteria } from './sandcastle-issue-criteria.mts';

/** Runs `gh` with these arguments, `input` on its stdin, and answers its stdout. */
export type GhRunner = (args: string[], input?: string) => string;

export interface TickOutput {
  out(text: string): void;
  err(text: string): void;
}

function gh(args: string[], input?: string): string {
  return execFileSync('gh', args, { encoding: 'utf8', input });
}

const PROCESS_OUTPUT: TickOutput = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

/** The whole command, given its arguments: answers the exit code. */
export function tickCriteria(
  argv: readonly string[],
  run: GhRunner,
  output: TickOutput = PROCESS_OUTPUT,
): number {
  const [issueArg, prArg] = argv;
  const issue = Number(issueArg);
  const pr = Number(prArg);
  if (!Number.isInteger(issue) || !Number.isInteger(pr)) {
    output.err('usage: sandcastle-tick-criteria.mts <issue> <pr>\n');
    return 2;
  }

  // JSON, not `--jq .body`: jq's trailing newline would be written back as an edit.
  const issueBody = (
    JSON.parse(run(['issue', 'view', String(issue), '--json', 'body'])) as {
      body: string;
    }
  ).body;
  const prView = JSON.parse(run(['pr', 'view', String(pr), '--json', 'body,url'])) as {
    body: string;
    url: string;
  };

  const { body, leftOpen } = tickIssueCriteria(issueBody, prView.body, pr);
  if (body !== issueBody) run(['issue', 'edit', String(issue), '--body-file', '-'], body);
  output.out(`${closingComment(prView.url, leftOpen)}\n`);
  return 0;
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  process.exitCode = tickCriteria(process.argv.slice(2), gh);
}

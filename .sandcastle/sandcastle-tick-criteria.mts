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
import { closingComment, tickIssueCriteria } from './sandcastle-issue-criteria.mts';

function gh(args: string[], input?: string): string {
  return execFileSync('gh', args, { encoding: 'utf8', input });
}

const [issueArg, prArg] = process.argv.slice(2);
const issue = Number(issueArg);
const pr = Number(prArg);
if (!Number.isInteger(issue) || !Number.isInteger(pr)) {
  console.error('usage: sandcastle-tick-criteria.mts <issue> <pr>');
  process.exit(2);
}

// JSON, not `--jq .body`: jq's trailing newline would be written back as an edit.
const issueBody = (
  JSON.parse(gh(['issue', 'view', String(issue), '--json', 'body'])) as {
    body: string;
  }
).body;
const prView = JSON.parse(gh(['pr', 'view', String(pr), '--json', 'body,url'])) as {
  body: string;
  url: string;
};

const { body, leftOpen } = tickIssueCriteria(issueBody, prView.body, pr);
if (body !== issueBody) gh(['issue', 'edit', String(issue), '--body-file', '-'], body);
process.stdout.write(`${closingComment(prView.url, leftOpen)}\n`);

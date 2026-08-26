import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { codeSpan, renderCommentBody, renderCommentFooter } from '../comment-links.mjs';

const RUN = 'https://github.com/climaa/acceptance-gate/actions/runs/1';
const ARTIFACT = `${RUN}/artifacts/9`;
const WORKFLOW =
  'https://github.com/climaa/acceptance-gate/actions/workflows/accept-baselines.yml';

const run = (over = {}) => ({
  remediated: true,
  summarised: true,
  runUrl: RUN,
  artifactUrl: ARTIFACT,
  workflowUrl: WORKFLOW,
  branch: 'feat/label-wand',
  sameRepo: true,
  retentionDays: 14,
  ...over,
});

describe('codeSpan', () => {
  it('wraps a plain value in one backtick', () => {
    expect(codeSpan('feat/x')).toBe('`feat/x`');
  });

  it('widens the fence for a value holding backticks — git permits them in ref names', () => {
    // A naive `${ref}` closes the span at the ref's own backtick and spills the rest.
    expect(codeSpan('feat/a`b')).toBe('``feat/a`b``');
    expect(codeSpan('feat/a``b')).toBe('```feat/a``b```');
  });

  it('pads a value that starts or ends with a backtick, per CommonMark', () => {
    expect(codeSpan('`lead')).toBe('`` `lead ``');
    expect(codeSpan('trail`')).toBe('`` trail` ``');
  });

  it('leaves markdown link syntax inert rather than escaping it', () => {
    // Inside a span it cannot form a link, so it needs no escaping — but it must not
    // gain the power to by being fenced too narrowly.
    expect(codeSpan('x](http://evil)[')).toBe('`x](http://evil)[`');
  });
});

describe('renderCommentFooter', () => {
  it('links the report, the dispatch and the run on a real diff', () => {
    const footer = renderCommentFooter(run());

    expect(footer).toContain(`[**report.html**](${ARTIFACT})`);
    expect(footer).toContain(`[**dispatch \`accept-baselines\`**](${WORKFLOW})`);
    expect(footer).toContain('on `feat/label-wand`');
    expect(footer).toContain(`[this run](${RUN})`);
  });

  it('falls back to the run when the upload produced no artifact url', () => {
    // `if-no-files-found` defaults to `warn`, so the upload step SUCCEEDS with an empty
    // output rather than failing — a fallback is the only thing standing between that
    // and a link to nowhere.
    const footer = renderCommentFooter(run({ artifactUrl: '' }));

    expect(footer).toContain(`[**report.html**](${RUN})`);
    expect(footer).not.toContain('artifacts/9');
  });

  it('drops the dispatch on a fork, whose branch this repo cannot dispatch', () => {
    const footer = renderCommentFooter(run({ sameRepo: false }));

    expect(footer).not.toContain('accept-baselines');
    expect(footer).toContain('[**report.html**]');
    expect(footer).toContain(`[this run](${RUN})`);
  });

  it('says nothing at all on a green run', () => {
    expect(renderCommentFooter(run({ remediated: false }))).toBe('');
  });

  it('offers only the run on a broken one — there is no report to link', () => {
    // The distinction the job's own `outcome` cannot make: exit 1 and exit 2 are both
    // `failure`, but a broken run wrote no report and measured nothing to accept.
    const footer = renderCommentFooter(run({ remediated: false, summarised: false }));

    expect(footer).toBe(`[this run](${RUN})`);
    expect(footer).not.toContain('report.html');
    expect(footer).not.toContain('accept-baselines');
  });

  it('quotes the retention it was given rather than restating a constant', () => {
    expect(renderCommentFooter(run({ retentionDays: 3 }))).toContain('Kept 3 days.');
  });
});

describe('renderCommentBody', () => {
  it('separates the footer with a blank line, never a bare newline', () => {
    // One newline and GFM reads the footer as a lazy continuation of remediation step 3,
    // rendering the links inside that list item instead of under the comment.
    const body = renderCommentBody(
      '<!-- m -->',
      '### To fix\n\n1. Review it.\n',
      'links',
    );

    expect(body).toBe('<!-- m -->\n### To fix\n\n1. Review it.\n\nlinks');
  });

  it('leaves no trailing separator when there is no footer', () => {
    const body = renderCommentBody('<!-- m -->', '## ✅ no changes\n', '');

    expect(body).toBe('<!-- m -->\n## ✅ no changes');
  });
});

describe('the workflow that consumes this', () => {
  const workflow = fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../.github/workflows/pr.yml',
    ),
    'utf8',
  );

  it('uploads the artifact before it posts the comment that links it', () => {
    // The ordering contract the workflow states in prose. `artifact-url` does not exist
    // until the upload has run, and the comment's `|| runUrl` fallback means the wrong
    // order degrades SILENTLY — every link pointing at the run, forever, nothing red.
    const upload = workflow.indexOf('id: report-artifact');
    const comment = workflow.indexOf('name: Post report comment');

    expect(upload).toBeGreaterThan(-1);
    expect(comment).toBeGreaterThan(-1);
    expect(upload).toBeLessThan(comment);
  });

  it('passes the retention it configures, so the copy cannot drift from the setting', () => {
    expect(workflow).toContain('REPORT_RETENTION_DAYS: 14');
    expect(workflow).toContain('retention-days: ${{ env.REPORT_RETENTION_DAYS }}');
    expect(workflow).toContain('RETENTION_DAYS: ${{ env.REPORT_RETENTION_DAYS }}');
  });
});

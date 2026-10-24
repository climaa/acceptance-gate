import { read } from './helpers';

/**
 * Source-text guard for the planner's view of the backlog.
 *
 * `gh issue list` returns 30 issues unless told otherwise, newest first. Past
 * 30 open issues the planner sees only the newest 30; if those are all on
 * hold it reports "No unblocked issues" while a released, older issue sits
 * just past the cut. Nothing fails loudly: a truncated list looks exactly like
 * a list where everything is held.
 *
 * The command lives in the prompt's shell expansion, so this is a text
 * assertion by necessity.
 */

const content = read('agent-docs/plan-prompt.md');
const issueLists = [...content.matchAll(/gh issue list[^`]*/g)].map((m) => m[0]);

describe('plan-prompt.md — the open-issue listing', () => {
  it('lists open issues exactly once', () => {
    expect(issueLists).toHaveLength(1);
  });

  it('raises gh’s 30-issue default far past any real backlog', () => {
    const limit = /--limit (\d+)/.exec(issueLists[0]!);
    expect(limit).not.toBeNull();
    expect(Number(limit![1])).toBeGreaterThanOrEqual(1000);
  });
});

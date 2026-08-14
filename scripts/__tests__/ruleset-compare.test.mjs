import { describe, expect, it } from 'vitest';

import { compare } from '../ruleset-compare.mjs';

// A trimmed .github/rulesets/main.json. Inline rather than read from disk: these
// specs pin comparison semantics, not this repo's current branch policy, and
// reading the real file would fail them the day someone legitimately edits a rule.
const desiredRuleset = () => ({
  name: 'main',
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    { type: 'non_fast_forward' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        required_review_thread_resolution: true,
        allowed_merge_methods: ['squash'],
      },
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: [{ context: 'gate', integration_id: 15368 }],
      },
    },
  ],
});

// What `GET /repos/{repo}/rulesets/{id}` answers with after that file was applied:
// every field back, wrapped in the ones GitHub owns and assigns itself. Each test
// below then introduces exactly one real-world deviation from this echo.
const liveFrom = (desired) => ({
  id: 4210983,
  source_type: 'Repository',
  source: 'climaa/acceptance-gate',
  created_at: '2026-08-01T09:14:22.000Z',
  updated_at: '2026-08-01T09:14:22.000Z',
  current_user_can_bypass: 'never',
  _links: { self: { href: 'https://api.github.com/repos/climaa/rulesets/4210983' } },
  ...structuredClone(desired),
});

const ruleOf = (ruleset, type) => ruleset.rules.find((rule) => rule.type === type);

describe('compare', () => {
  it('ignores parameters GitHub materialises that the file never declared', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    Object.assign(ruleOf(live, 'pull_request').parameters, {
      required_reviewers: [],
      dismissal_restriction: { users: [], teams: [], apps: [] },
      ignore_approvals_from_contributors: false,
    });

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('ignores the top-level fields GitHub owns', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('matches rules by type, so a reordered live rules array is not drift', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    live.rules.reverse();

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('matches a live rule type the file does not declare at all', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    live.rules.push({ type: 'creation' });

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('treats a declared empty array and an absent response field as the same state', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    delete live.bypass_actors;

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('skips a managed field the file does not declare', () => {
    const desired = desiredRuleset();
    delete desired.bypass_actors;
    const live = liveFrom(desired);
    live.bypass_actors = [
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ];

    const result = compare(desired, live);

    expect(result).toEqual({ ok: true, mismatches: [] });
  });

  it('reports a changed required status check context, with its path', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    ruleOf(live, 'required_status_checks').parameters.required_status_checks[0].context =
      'checks';

    const result = compare(desired, live);

    expect(result).toEqual({
      ok: false,
      mismatches: [
        'rules.required_status_checks.parameters.required_status_checks[0].context: ' +
          'want "gate", live "checks"',
      ],
    });
  });

  it('reports a flipped boolean, with its path', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    ruleOf(live, 'pull_request').parameters.required_review_thread_resolution = false;

    const result = compare(desired, live);

    expect(result).toEqual({
      ok: false,
      mismatches: [
        'rules.pull_request.parameters.required_review_thread_resolution: want true, live false',
      ],
    });
  });

  it('reports a rule missing entirely, by type rather than by position', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    live.rules = live.rules.filter((rule) => rule.type !== 'non_fast_forward');

    const result = compare(desired, live);

    expect(result).toEqual({
      ok: false,
      mismatches: ['rules.non_fast_forward: missing from the live ruleset'],
    });
  });

  // The shape the list endpoint returns: a summary carrying no `rules` at all.
  // apply-ruleset.mjs re-fetches by id to avoid it, and this pins what it would
  // report if that fetch were ever dropped — every declared rule, not a crash.
  it('reports every declared rule when the response carries no rules array', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    delete live.rules;

    const result = compare(desired, live);

    expect(result).toEqual({
      ok: false,
      mismatches: [
        'rules.deletion: missing from the live ruleset',
        'rules.non_fast_forward: missing from the live ruleset',
        'rules.pull_request: missing from the live ruleset',
        'rules.required_status_checks: missing from the live ruleset',
      ],
    });
  });

  it('reports every mismatch in one pass rather than stopping at the first', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    ruleOf(live, 'required_status_checks').parameters.required_status_checks[0].context =
      'gate ';
    ruleOf(live, 'pull_request').parameters.required_review_thread_resolution = false;
    live.rules = live.rules.filter((rule) => rule.type !== 'deletion');

    const result = compare(desired, live);

    expect(result.mismatches).toEqual([
      'rules.deletion: missing from the live ruleset',
      'rules.pull_request.parameters.required_review_thread_resolution: want true, live false',
      'rules.required_status_checks.parameters.required_status_checks[0].context: ' +
        'want "gate", live "gate "',
    ]);
  });

  it('reports a declared non-empty array the response omits', () => {
    const desired = desiredRuleset();
    desired.bypass_actors = [
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ];
    const live = liveFrom(desired);
    delete live.bypass_actors;

    const result = compare(desired, live);

    expect(result).toEqual({ ok: false, mismatches: ['bypass_actors'] });
  });

  it('reports an extra entry in a live condition array', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    live.conditions.ref_name.include.push('refs/heads/release/*');

    const result = compare(desired, live);

    expect(result).toEqual({ ok: false, mismatches: ['conditions.ref_name.include'] });
  });

  it('reports a rule whose parameters the response drops entirely', () => {
    const desired = desiredRuleset();
    const live = liveFrom(desired);
    delete ruleOf(live, 'pull_request').parameters;

    const result = compare(desired, live);

    expect(result).toEqual({ ok: false, mismatches: ['rules.pull_request.parameters'] });
  });
});

import {
  describeTurboCache,
  parseTurboLink,
  resolveTurboCache,
} from '../sandcastle-turbo-cache.mts';

/**
 * REAL unit tests, not source-text assertions — sandcastle-turbo-cache.mts
 * imports nothing from this directory precisely so it can be loaded without
 * dragging in sandcastle-config.mts's import-time side effects (same reasoning
 * as sandcastle-model-overrides.mts).
 *
 * What is being protected: this resolver decides whether build artifacts are
 * published to a remote cache, and to WHOSE. Writing to the wrong team's cache
 * is unrecoverable, so every uncertain branch must fail closed. The regression
 * that motivated this module was a `TURBO_TEAM` exported from a shell profile
 * silently redirecting a personal repo's cache to an unrelated team — hence
 * the resolver takes its inputs as arguments and cannot see process.env at all.
 */

const TEAM = 'team_AbC123XyZ456';
const TOKEN = 'turbo-token-abcdefghijklmnop';
const LINK = JSON.stringify({ teamId: TEAM });
const ENV = `TURBO_TOKEN=${TOKEN}\nTURBO_TEAM=${TEAM}\n`;

describe('parseTurboLink', () => {
  it('reads teamId from a well-formed link', () => {
    expect(parseTurboLink(LINK)).toBe(TEAM);
  });

  // Absent, malformed and teamId-less all mean the same thing to the caller:
  // nothing trustworthy to compare against.
  it.each([
    ['absent', null],
    ['empty string', ''],
    ['malformed JSON', '{not json'],
    ['JSON array', '[]'],
    ['JSON null', 'null'],
    ['JSON string', '"team_x"'],
    ['object without teamId', '{"other":1}'],
    ['teamId of the wrong type', '{"teamId":42}'],
  ])('returns "" for %s', (_label, input) => {
    expect(parseTurboLink(input)).toBe('');
  });
});

describe('resolveTurboCache', () => {
  it('enables the cache when .env matches this repo’s turbo link', () => {
    const cache = resolveTurboCache(ENV, LINK);
    expect(cache).toEqual({ enabled: true, token: TOKEN, team: TEAM });
  });

  it('tolerates comments, blank lines and quotes in .env', () => {
    const messy = `# turbo\n\nTURBO_TOKEN="${TOKEN}"\n\nTURBO_TEAM='${TEAM}'\n`;
    expect(resolveTurboCache(messy, LINK)).toEqual({
      enabled: true,
      token: TOKEN,
      team: TEAM,
    });
  });

  // The regression this module exists for.
  it('refuses a team that is not this repo’s', () => {
    const foreign = `TURBO_TOKEN=${TOKEN}\nTURBO_TEAM=some-other-team\n`;
    expect(resolveTurboCache(foreign, LINK)).toEqual({
      enabled: false,
      reason: 'foreign-team',
      team: 'some-other-team',
    });
  });

  // Fails closed: with no link there is nothing to verify against, so a
  // plausible-looking team must NOT be taken on trust.
  it.each([
    ['absent', null],
    ['malformed', '{not json'],
    ['teamId-less', '{}'],
  ])('refuses when the turbo link is %s', (_label, link) => {
    expect(resolveTurboCache(ENV, link)).toEqual({
      enabled: false,
      reason: 'no-link',
      team: TEAM,
    });
  });

  it.each([
    ['no .env at all', null],
    ['empty .env', ''],
    ['token without team', `TURBO_TOKEN=${TOKEN}\n`],
    ['team without token', `TURBO_TEAM=${TEAM}\n`],
    ['both present but blank', 'TURBO_TOKEN=\nTURBO_TEAM=\n'],
    ['unrelated keys only', 'GH_TOKEN=xyz\n'],
  ])('disables the cache for %s', (_label, env) => {
    const cache = resolveTurboCache(env, LINK);
    expect(cache.enabled).toBe(false);
    if (!cache.enabled) expect(cache.reason).toBe('no-credentials');
  });

  // Behavioural proof that ambient env cannot reach the resolver: the very
  // values that caused the original leak are exported here, and ignored.
  it('ignores process.env entirely', () => {
    const before = {
      token: process.env.TURBO_TOKEN,
      team: process.env.TURBO_TEAM,
    };
    process.env.TURBO_TOKEN = 'ambient-token-that-must-not-be-used';
    process.env.TURBO_TEAM = 'ambient-foreign-team';
    try {
      expect(resolveTurboCache(ENV, LINK)).toEqual({
        enabled: true,
        token: TOKEN,
        team: TEAM,
      });
      // ...and with no .env it stays disabled rather than falling back.
      expect(resolveTurboCache(null, LINK).enabled).toBe(false);
    } finally {
      process.env.TURBO_TOKEN = before.token;
      process.env.TURBO_TEAM = before.team;
    }
  });

  it('does not mutate process.env while parsing', () => {
    const sentinel = 'untouched';
    process.env.TURBO_TEAM = sentinel;
    try {
      resolveTurboCache(ENV, LINK);
      expect(process.env.TURBO_TEAM).toBe(sentinel);
    } finally {
      delete process.env.TURBO_TEAM;
    }
  });
});

describe('describeTurboCache', () => {
  it('reports length, never the token itself', () => {
    const message = describeTurboCache(resolveTurboCache(ENV, LINK));
    expect(message).toContain(`TURBO_TOKEN=${TOKEN.length} chars`);
    expect(message).not.toContain(TOKEN);
  });

  it('names the rejected team so the operator can see what was refused', () => {
    const foreign = `TURBO_TOKEN=${TOKEN}\nTURBO_TEAM=some-other-team\n`;
    expect(describeTurboCache(resolveTurboCache(foreign, LINK))).toContain(
      'some-other-team',
    );
  });

  it.each([
    ['no-credentials', resolveTurboCache(null, LINK)],
    ['no-link', resolveTurboCache(ENV, null)],
    ['foreign-team', resolveTurboCache(`TURBO_TOKEN=${TOKEN}\nTURBO_TEAM=x\n`, LINK)],
  ])('explains the %s case as disabled', (_label, cache) => {
    const message = describeTurboCache(cache);
    expect(message).toContain('remote cache disabled');
    expect(message).not.toContain(TOKEN);
  });
});

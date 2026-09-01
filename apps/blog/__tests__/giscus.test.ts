// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  discussionTerm,
  giscusScriptAttributes,
  GISCUS_CATEGORY_ID,
  GISCUS_CONFIGURED,
  GISCUS_ORIGIN,
  GISCUS_REPO_ID,
  isGiscusMetadataMessage,
} from '../lib/giscus';

/**
 * The comment embed's contract, asserted where it is decided rather than in a
 * browser. Every claim here is about a pure function, so the lowest layer that
 * can catch the failure is this one — per CODING_STANDARDS.
 *
 * What is NOT here: that a press mounts a thread, and that a mounted thread
 * turns the icon green. Both are behaviour across a network boundary and both
 * live in `apps/e2e/features/acceptance/changelog-comments.feature`.
 */

describe('discussionTerm', () => {
  /**
   * The one case that matters, and it is a tripwire rather than a tautology.
   *
   * A term is permanent once a thread exists under it: giscus finds no
   * discussion with a renamed term, opens an empty one, and the old thread
   * keeps its comments with nothing linking to it. So this pins the literal
   * string, and a future edit to the prefix reds this test rather than silently
   * orphaning every conversation the site has ever had.
   */
  it('derives the term from the tag, and the prefix never moves', () => {
    expect(discussionTerm('v1.3.0')).toBe('changelog-v1.3.0');
  });

  it('gives two releases two different terms', () => {
    // The whole reason the mapping is `specific`: with giscus's default
    // `pathname` mapping, every release on /changelog would share one thread
    // and one set of reactions.
    expect(discussionTerm('v1.3.0')).not.toBe(discussionTerm('v1.2.0'));
  });
});

describe('isGiscusMetadataMessage', () => {
  it('accepts the message that means a discussion rendered', () => {
    expect(isGiscusMetadataMessage({ giscus: { discussion: { id: 'D_1' } } })).toBe(true);
  });

  /**
   * The refusal that carries the weight. A mounted embed posts its resize
   * height continuously for as long as it is on the page, so a guard that
   * accepted any giscus-shaped message would let an already-open thread's
   * traffic answer for a mount still in flight — the check mark over a
   * conversation that never loaded.
   */
  it('refuses a giscus message that is not the metadata one', () => {
    expect(isGiscusMetadataMessage({ giscus: { resizeHeight: 420 } })).toBe(false);
  });

  it('refuses anything that is not a giscus message at all', () => {
    // `null` explicitly: `typeof null === 'object'`, so a guard written as a
    // bare typeof check passes it and then throws on the property read.
    for (const data of [null, undefined, 'giscus', 42, {}, { giscus: null }]) {
      expect(isGiscusMetadataMessage(data)).toBe(false);
    }
  });
});

describe('giscusScriptAttributes', () => {
  const attributes = giscusScriptAttributes('changelog-v1.3.0', false);

  it('asks for a thread per release rather than per page', () => {
    expect(attributes['data-mapping']).toBe('specific');
    expect(attributes['data-term']).toBe('changelog-v1.3.0');
  });

  /**
   * Without this the embed never announces itself, the mount has no signal to
   * wait on, and the only thing left to conclude from is the timeout — which is
   * allowed to conclude failure and nothing else. Turning it off would make
   * every thread end red fifteen seconds after it loaded fine.
   */
  it('asks the embed to emit its metadata, which is the mount signal', () => {
    expect(attributes['data-emit-metadata']).toBe('1');
  });

  it('carries the theme, and the theme follows the flag', () => {
    expect(attributes['data-theme']).toBe('light');
    expect(giscusScriptAttributes('changelog-v1.3.0', true)['data-theme']).toBe('dark');
  });
});

describe('configuration', () => {
  /**
   * `GISCUS_CONFIGURED` gates whether the control is rendered at all, so a
   * blank id would not fail — it would quietly remove the feature from the
   * page. This is the only thing that notices.
   */
  it('has both ids, so the control is rendered', () => {
    expect(GISCUS_REPO_ID).not.toBe('');
    expect(GISCUS_CATEGORY_ID).not.toBe('');
    expect(GISCUS_CONFIGURED).toBe(true);
  });

  it('names one origin, with no trailing slash to defeat an equality check', () => {
    // Compared with `===` against `event.origin`, which never carries a
    // trailing slash. A slash here would refuse every real message.
    expect(GISCUS_ORIGIN).toBe('https://giscus.app');
  });
});

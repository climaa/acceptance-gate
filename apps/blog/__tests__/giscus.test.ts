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
  giscusOutcome,
  EMPTY_THREAD_ERROR,
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

describe('giscusOutcome', () => {
  it('reads a discussion as the thread having arrived', () => {
    expect(giscusOutcome({ giscus: { discussion: { id: 'D_1' } } })).toBe('mounted');
  });

  /**
   * The case that was a live bug, not a hypothesis.
   *
   * With `mapping=specific` giscus has no discussion until somebody posts the
   * first comment, so on an empty release it renders the whole embed — 0
   * comments, a Write box, a sign-in link — and reports this error. Measured
   * against the real service: a usable textarea and no `discussion` metadata,
   * ever. Treating it as a failure meant the control spun for fifteen seconds
   * and then put a red cross over a working conversation, on every release,
   * because every release starts empty.
   */
  it('reads an empty thread as mounted, because the conversation IS there', () => {
    expect(giscusOutcome({ giscus: { error: EMPTY_THREAD_ERROR } })).toBe('mounted');
  });

  it('pins the exact string, because it is matched literally', () => {
    // giscus sends this as prose. `data-lang` is pinned to `en` so the wording
    // is stable per locale, but a reword upstream silently reinstates the bug
    // above — this is the line that has to be edited when that happens.
    expect(EMPTY_THREAD_ERROR).toBe('Discussion not found');
  });

  it('reads any other error as a failure', () => {
    expect(
      giscusOutcome({ giscus: { error: 'giscus is not installed on this repository' } }),
    ).toBe('failed');
  });

  /**
   * A mounted embed posts its resize height continuously for as long as it is on
   * the page. Answering with an outcome would let an already-open thread's
   * traffic settle a mount still in flight — the check mark over a conversation
   * that never rendered.
   */
  it('says nothing about a message that is neither', () => {
    expect(giscusOutcome({ giscus: { resizeHeight: 420 } })).toBeNull();
  });

  it('says nothing about anything that is not a giscus message', () => {
    // `null` explicitly: `typeof null === 'object'`, so a guard written as a
    // bare typeof check passes it and then throws on the property read.
    for (const data of [null, undefined, 'giscus', 42, {}, { giscus: null }]) {
      expect(giscusOutcome(data)).toBeNull();
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

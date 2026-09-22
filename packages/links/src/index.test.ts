import { describe, expect, it } from 'vitest';

import { CAMPAIGN_PARAM, SOURCES, tagOutbound } from './index';

const CONSOLE = 'https://visual-diff-ui.carloslima.dev/';

describe('SOURCES', () => {
  /**
   * Named rather than derived, and it is the whole point of the list.
   *
   * These four values are accepted by `climaa/portafolio`'s `CAMPAIGN_SOURCES`,
   * which deletes anything outside it — silently, at the locale redirect, so the
   * visit counts as direct and both dashboards read exactly as they did before.
   * A value renamed here and not there does not half-work; it stops counting.
   * So the spelling is pinned where changing it has to be deliberate.
   */
  it('is the four values the portfolio accepts', () => {
    expect([...SOURCES]).toEqual(['blog', 'manual', 'visual-diff-ui', 'storybook']);
  });
});

describe('tagOutbound', () => {
  it('writes the source onto a bare address', () => {
    const tagged = tagOutbound(CONSOLE, 'blog');

    expect(new URL(tagged).searchParams.get(CAMPAIGN_PARAM)).toBe('blog');
  });

  /** `set`, not `append`. Two sources on one address is two dashboard rows for
   *  one reader, and neither of them is right. */
  it('replaces a stale tag rather than appending a second', () => {
    const tagged = tagOutbound(`${CONSOLE}?utm_source=manual`, 'blog');

    expect(new URL(tagged).searchParams.getAll(CAMPAIGN_PARAM)).toEqual(['blog']);
  });

  /**
   * The Storybook deep links this repository writes in prose all arrive
   * carrying `?path=`, and `apps/storybook/__tests__/docs-links.test.ts`
   * anchors its own assertions on `\?path=`. A tag that landed first, with its
   * own `?`, would break that regex and take the docs link check with it.
   */
  it('keeps an existing query and joins it with &', () => {
    const deep =
      'https://storybook.carloslima.dev/index.html?path=/docs/docs-welcome--docs';

    const tagged = tagOutbound(deep, 'blog');

    expect(tagged).toBe(`${deep}&utm_source=blog`);
  });

  it('leaves the path and the hash alone', () => {
    const tagged = tagOutbound('https://blog.carloslima.dev/about#contact', 'manual');

    expect(tagged).toBe('https://blog.carloslima.dev/about?utm_source=manual#contact');
  });

  /**
   * The regression for the defect this helper shipped with for about an hour.
   *
   * `searchParams.set` re-serializes every parameter, not just the one it
   * writes, so this address came back with `%2F` in place of each slash and a
   * `%3A` where `report-view.ts` documents that the colon must stay literal —
   * "percent-encoding it renders every dark link light". The query is copied
   * verbatim now, and this is the address that proves it.
   */
  it('escapes nothing in a query it was not asked about', () => {
    const story =
      'https://storybook.carloslima.dev/index.html?path=/story/atoms-badge--tones&globals=colorScheme:dark';

    const tagged = tagOutbound(story, 'visual-diff-ui');

    expect(tagged).toBe(`${story}&utm_source=visual-diff-ui`);
  });

  /**
   * THE HOST IS THE CALLER'S PROBLEM, asserted so the decision is written down
   * rather than merely absent. This function cannot know what an own property
   * is — the list lives across four apps and changes without it. Tagging
   * `github.com` is therefore possible and wrong, and what stops it is the call
   * site plus `docs-links.test.ts`, never this.
   */
  it('does not refuse a host that is not an own property', () => {
    const tagged = tagOutbound('https://github.com/climaa', 'blog');

    expect(tagged).toBe('https://github.com/climaa?utm_source=blog');
  });

  /** The error path. A relative href was never a referral, and `new URL` is
   *  what refuses it — there is no second opinion to write here. */
  it('throws on an address that is not absolute', () => {
    expect(() => tagOutbound('/rss.xml', 'blog')).toThrow(TypeError);
  });

  /**
   * The other error path, and the one `new URL` will not refuse for us: it
   * parses `javascript:` happily, so "absolute" is not the property that makes
   * an address safe to write into an `href`. Nothing here builds a link from
   * reader input today; this is what keeps that true if something ever does.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'refuses %s, which is absolute but not an address',
    (hostile) => {
      expect(() => tagOutbound(hostile, 'blog')).toThrow(TypeError);
    },
  );
});

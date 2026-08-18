// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { A11Y_VERDICT, StoryCard } from '../components/StoryCard';
import { buildSections, type ReportCard } from '../lib/report-view';
import type { Variant } from '../lib/summary';

/**
 * One card, and the two failures a pixel tool cannot show.
 *
 * An `a11y` card is the differentiator: its viewer is replaced by the violation
 * list — the shots can be byte-identical and a diff of two identical images
 * says nothing about a contrast ratio — and it carries no way to accept
 * anything, because reviewing has never fixed one.
 *
 * A `removed` card is the other: one side of the comparison does not exist, and
 * the frame for that side says so rather than standing empty.
 */

const REPORT_ID = 'main-2026-08-17__main-2026-08-13';

const SIDES = { a: 'main-2026-08-17', b: 'main-2026-08-13' };

function variant(overrides: Partial<Variant> & Pick<Variant, 'key' | 'id'>): Variant {
  return {
    tier: 'atoms',
    viewport: 'desktop',
    theme: 'light',
    bucket: 'changed',
    overlapDiffPixels: 4213,
    marginPixels: 0,
    diffPixels: 4213,
    allowedDiffPixels: 292,
    width: 1248,
    height: 469,
    sizeDelta: null,
    violations: [],
    error: null,
    ...overrides,
  };
}

/** The card the report would build from these variants — the same grouping the
 *  page uses, rather than a hand-assembled shape that could drift from it. */
function cardOf(...variants: Variant[]): ReportCard {
  const [section] = buildSections(variants);
  const card = section?.cards[0];
  if (!card) throw new Error('the fixture built no card');

  return card;
}

function renderCard(card: ReportCard, reviewed: readonly string[] = []) {
  return render(
    <StoryCard
      reportId={REPORT_ID}
      card={card}
      sides={SIDES}
      reviewed={new Set(reviewed)}
      onToggle={vi.fn()}
      onCompare={vi.fn()}
    />,
  );
}

const card = () => screen.getByRole('article');

/** One of the viewer's three frames, by the side it shows. */
const frame = (name: string) => within(card()).getByRole('figure', { name });

afterEach(() => {
  cleanup();
  // `showsDevStorybook` reads the mode per call, so a stub left standing would
  // decide the next test's markup.
  vi.unstubAllEnvs();
});

describe('a pixel card', () => {
  it('titles itself from the story slug', () => {
    renderCard(
      cardOf(
        variant({
          key: 'templates__desktop__light__templates-posttemplate--long-prose',
          id: 'templates-posttemplate--long-prose',
          tier: 'templates',
        }),
      ),
    );

    // The heading names the article, so the card is findable by the title a
    // reviewer reads rather than by the slug the differ recorded.
    expect(
      screen.getByRole('article', { name: 'PostTemplate — Long Prose' }),
    ).toBeTruthy();
  });

  it('reports the worst of its variants, grouped', () => {
    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__light__atoms-badge--tones',
          id: 'atoms-badge--tones',
        }),
        variant({
          key: 'atoms__desktop__dark__atoms-badge--tones',
          id: 'atoms-badge--tones',
          theme: 'dark',
          overlapDiffPixels: 12216,
        }),
      ),
    );

    expect(within(card()).getByText('worst 12,216 px')).toBeTruthy();
  });

  // Three things this asserts, each a way the link has already been wrong:
  //
  //  - `?path=`, not `/iframe.html`: the bare preview document has no sidebar
  //    and no toolbar, and a reviewer following one of these came to look around.
  //  - `/index.html`, not the bare origin. `apps/storybook/vercel.json`
  //    redirects `/` to the Welcome page, and Vercel resolves that by keeping
  //    the destination's `path` and appending the request's — so a link through
  //    `/` opens Welcome instead of the story. Do not "simplify" this away.
  //  - the `colorScheme:` colon verbatim. Percent-encoded, Storybook accepts the
  //    URL and silently ignores the global, so every dark link opens a light
  //    story — a failure that looks exactly like a passing one. (That same
  //    redirect encodes the colon on the way, which is how it broke both at once.)
  it('deep-links the story into both Storybooks with the globals colon literal', () => {
    vi.stubEnv('NODE_ENV', 'development');

    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__dark__atoms-badge--tones',
          id: 'atoms-badge--tones',
          theme: 'dark',
        }),
      ),
    );

    const dev = within(card()).getByRole('link', { name: 'dev Storybook' });
    const published = within(card()).getByRole('link', { name: 'baseline Storybook' });

    expect(dev.getAttribute('href')).toBe(
      'http://localhost:6006/index.html?path=/story/atoms-badge--tones&globals=colorScheme:dark',
    );
    expect(published.getAttribute('href')).toBe(
      'https://acceptance-gate-storybook.vercel.app/index.html?path=/story/atoms-badge--tones&globals=colorScheme:dark',
    );
  });

  // A deployed console has no Storybook on localhost, and a dead link beside a
  // live one is worse than no link — the published build still answers.
  it('offers only the published Storybook when nothing is running locally', () => {
    vi.stubEnv('NODE_ENV', 'production');

    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__dark__atoms-badge--tones',
          id: 'atoms-badge--tones',
          theme: 'dark',
        }),
      ),
    );

    expect(within(card()).queryByRole('link', { name: 'dev Storybook' })).toBeNull();
    expect(within(card()).getByRole('link', { name: 'baseline Storybook' })).toBeTruthy();
  });

  // The card explains only what varies per card: a viewport its tier *is* shot
  // at, whose every variant matched. The tier-scoped half — "atoms are captured
  // at desktop only" — is identical for every card in the section and is said
  // once by the section instead.
  it('names a viewport whose rows all matched their baseline', () => {
    renderCard(
      cardOf(
        variant({
          key: 'templates__desktop__light__templates-posttemplate--default',
          id: 'templates-posttemplate--default',
          tier: 'templates',
        }),
      ),
    );

    const gaps = within(card()).getByRole('list', {
      name: 'viewports not shown for PostTemplate — Default',
    });

    expect(gaps.textContent).toContain('matched its baseline');
  });

  it('does not repeat its tier\u2019s capture policy under the card', () => {
    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__light__atoms-prose--default',
          id: 'atoms-prose--default',
        }),
      ),
    );

    expect(
      within(card()).queryByRole('list', { name: /viewports not shown/ }),
    ).toBeNull();
  });

  it('marks itself as some, rather than all, when one variant is reviewed', () => {
    const subject = cardOf(
      variant({
        key: 'atoms__desktop__light__atoms-badge--tones',
        id: 'atoms-badge--tones',
      }),
      variant({
        key: 'atoms__desktop__dark__atoms-badge--tones',
        id: 'atoms-badge--tones',
        theme: 'dark',
      }),
    );

    renderCard(subject, ['atoms__desktop__light__atoms-badge--tones']);

    expect(
      within(card())
        .getByRole('checkbox', { name: 'reviewed' })
        .getAttribute('aria-checked'),
    ).toBe('mixed');
  });
});

describe('an accessibility card', () => {
  const a11yCard = () =>
    cardOf(
      variant({
        key: 'atoms__desktop__light__atoms-badge--tones',
        id: 'atoms-badge--tones',
        bucket: 'a11y',
        overlapDiffPixels: 0,
        violations: [{ id: 'color-contrast', nodes: 2 }],
      }),
    );

  it('replaces the diff pane with the violation list', () => {
    renderCard(a11yCard());

    const violations = within(card()).getByRole('list', { name: 'violations' });

    expect(within(violations).getByText('color-contrast')).toBeTruthy();
    expect(within(violations).getByText('2 node(s)')).toBeTruthy();
  });

  it('renders no diff image at all', () => {
    renderCard(a11yCard());

    expect(within(card()).queryAllByRole('img')).toHaveLength(0);
  });

  it('states that reviewing does not clear it', () => {
    renderCard(a11yCard());

    expect(within(card()).getByText(A11Y_VERDICT)).toBeTruthy();
    expect(A11Y_VERDICT).toBe('reviewing does not clear this — fixing does');
  });

  it('offers no accept affordance', () => {
    renderCard(a11yCard());

    expect(within(card()).queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('links the rule to its own documentation', () => {
    renderCard(a11yCard());

    const docs = within(card()).getByRole('link', { name: 'rule docs' });

    expect(docs.getAttribute('href')).toBe(
      'https://dequeuniversity.com/rules/axe/4.12/color-contrast',
    );
  });
});

describe('a card with a missing side', () => {
  it('names the side a removed story never had', () => {
    renderCard(
      cardOf(
        variant({
          key: 'molecules__desktop__light__molecules-taglist--empty',
          id: 'molecules-taglist--empty',
          tier: 'molecules',
          bucket: 'removed',
          overlapDiffPixels: 0,
          diffPixels: 0,
          allowedDiffPixels: 0,
        }),
      ),
    );

    expect(within(frame(`B · ${SIDES.b}`)).getByText('not on this side')).toBeTruthy();
  });

  it('names the other side for a story that was added', () => {
    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__light__atoms-bucketchip--tones',
          id: 'atoms-bucketchip--tones',
          bucket: 'added',
          overlapDiffPixels: 0,
          diffPixels: 0,
          allowedDiffPixels: 0,
        }),
      ),
    );

    expect(within(frame(`A · ${SIDES.a}`)).getByText('not on this side')).toBeTruthy();
  });

  it('shows what a capture error said', () => {
    renderCard(
      cardOf(
        variant({
          key: 'atoms__desktop__light__atoms-prose--default',
          id: 'atoms-prose--default',
          bucket: 'errored',
          overlapDiffPixels: 0,
          error: 'Timeout 30000ms exceeded waiting for #storybook-root',
        }),
      ),
    );

    expect(
      within(card()).getByText(/Timeout 30000ms exceeded waiting for #storybook-root/),
    ).toBeTruthy();
  });
});

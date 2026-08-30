import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Prose, Stack, StepList, type Theme, Thumbnail } from '@gate/ui';
import { INTROS } from '@/content/intros';
import { SCREENSHOTS } from '@/content/screenshots';
import { findManualPage, MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';

// Three known slugs, by hand. This is the whole of what a docs framework's
// loader would buy at this size, which is why there is no docs framework here
// yet — the sidebar tree and search that would justify one do not exist.
export function generateStaticParams() {
  return MANUAL_PAGES.map((page) => ({ slug: page.slug }));
}

/**
 * The figure's two captures, in render order.
 *
 * `satisfies` rather than a bare literal so these stay the design system's
 * themes: a typo, or a name this repo does not theme by, is a compile error
 * here rather than a `<span>` no stylesheet ever matches.
 */
const THEMES = ['light', 'dark'] as const satisfies readonly Theme[];

/**
 * Written out per theme rather than composed from the loop variable. Both class
 * names have to survive as literal text: `app/globals.css` is checked against
 * the classes its consumers name — the sweep `apps/blog` and
 * `apps/visual-diff-ui` both run to find rules nothing renders — and a template
 * string would make these two rules read as orphans the day this app grows the
 * same test.
 */
const SHOT_CLASS: Record<Theme, string> = {
  light: 'manual-figure__shot manual-figure__shot--light',
  dark: 'manual-figure__shot manual-figure__shot--dark',
};

// No `dynamicParams = false` to go with it, though the three above really are
// the only pages there are: the segment config is refused outright under
// `cacheComponents`. The unknown-slug fallback therefore stays reachable, and
// `notFound()` below is what answers it.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = findManualPage(slug);

  return page ? { title: page.title } : {};
}

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findManualPage(slug);

  if (!page) notFound();

  const feature = parseManualPage(page);
  const shot = SCREENSHOTS[page.slug];

  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <h1 className="manual-title">{page.title}</h1>
        <Prose>
          {INTROS[page.slug].map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </Prose>
      </Stack>

      {shot && (
        // A figure, not decoration: the caption says what to look at and the alt
        // says what is there, so neither has to carry both jobs.
        //
        // Both themes are in the DOM and CSS shows one, rather than the server
        // or a hook choosing. The theme is a client fact this page is rendered
        // without — `lib/theme.ts` writes `data-theme` from `<head>`, before the
        // first paint — so picking here would mean rendering light and
        // correcting it after hydration, which is the flash the head script
        // exists to prevent. A stylesheet knows the answer at paint time and
        // needs no render to act on it.
        //
        // The hidden half leaves the accessibility tree with its subtree, so a
        // screen reader is offered one image and one alt, not two.
        //
        // Mapped rather than written twice, so the pair cannot drift: every
        // prop but the source is shared by construction, and an alt or a
        // dimension added to one half can no longer be forgotten on the other.
        <figure className="manual-figure">
          {THEMES.map((theme) => (
            <span key={theme} className={SHOT_CLASS[theme]}>
              <Thumbnail
                src={shot[theme]}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
              />
            </span>
          ))}
          <figcaption className="manual-figure__caption">{shot.caption}</figcaption>
        </figure>
      )}

      {feature.background.length > 0 && (
        <div className="manual-precondition">
          <span className="manual-precondition__label">Before each task</span>
          {/* The keywords are dropped here and only here. A Background is all
              `Given` by construction, so printing it adds a word without adding
              a distinction, and the label already says these are preconditions.
              The steps below keep theirs, where the Given/When/Then rhythm is
              what tells a reader which parts they perform. */}
          {/* Unordered, unlike the steps below. These hold simultaneously; they
              are not a sequence to work through, and numbering one precondition
              "1." says otherwise. */}
          <ul className="manual-precondition__list">
            {feature.background.map((step, index) => (
              <li key={index}>{step.text}</li>
            ))}
          </ul>
        </div>
      )}

      <Stack gap={5}>
        {/* Tags are parsed but never drawn. The only one in scope is `@desktop`,
            which tells the test runner which viewport to use — test
            infrastructure, not something a reader of this page does. */}
        {feature.scenarios.map((scenario, index) => (
          // Position, not name: Gherkin permits two scenarios to share a name,
          // and nothing in the source forbids it.
          <Card key={index}>
            <CardTitle>{scenario.name}</CardTitle>
            <StepList
              steps={scenario.steps.map((step) => ({
                keyword: step.keyword,
                meaning: step.keywordType,
                text: step.text,
              }))}
            />
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

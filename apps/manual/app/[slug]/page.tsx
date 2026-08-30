import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Prose, Stack, StepList, Thumbnail } from '@gate/ui';
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
        <figure className="manual-figure">
          <Thumbnail
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
          />
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

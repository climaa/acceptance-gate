import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Prose, Stack } from '@gate/ui';
import { INTROS } from '@/content/intros';
import { findManualPage, MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage, type ManualStep } from '@/lib/features';

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

function StepList({ steps }: { steps: ManualStep[] }) {
  return (
    <ol className="manual-steps">
      {steps.map((step, index) => (
        // Steps are identified by position: the same text can legitimately
        // appear twice in one scenario, and the order is the requirement.
        <li key={index}>
          <span className="manual-steps__keyword">{step.keyword}</span> {step.text}
        </li>
      ))}
    </ol>
  );
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

  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <h1 className="manual-title">{page.title}</h1>
        <Prose>
          {INTROS[page.slug].map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </Prose>
      </Stack>

      {feature.background.length > 0 && (
        <div className="manual-precondition">
          <span className="manual-precondition__label">Before each task</span>
          {/* The keywords are dropped here and only here. A Background is all
              `Given` by construction, so printing it adds a word without adding
              a distinction, and the label already says these are preconditions.
              The steps below keep theirs, where the Given/When/Then rhythm is
              what tells a reader which parts they perform. */}
          <ol className="manual-steps">
            {feature.background.map((step, index) => (
              <li key={index}>{step.text}</li>
            ))}
          </ol>
        </div>
      )}

      <Stack gap={5}>
        {/* Tags are parsed but never drawn. The only one in scope is `@desktop`,
            which tells the test runner which viewport to use — test
            infrastructure, not something a reader of this page does. */}
        {feature.scenarios.map((scenario) => (
          <Card key={scenario.name}>
            <CardTitle>{scenario.name}</CardTitle>
            <StepList steps={scenario.steps} />
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}

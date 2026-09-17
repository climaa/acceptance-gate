import NextLink from 'next/link';
import { Badge, Card, CardTitle, Link, Prose, Stack } from '@gate/ui';
import { ABOUT_MANUAL, INDEX_LEAD, INTROS, START_HERE } from '@/content/intros';
import { MANUAL_PAGES, TOUR_SLUG } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';
import { CONSOLE_URL, SITE_TITLE } from '@/lib/site';

export default function IndexPage() {
  // The count comes from the source, not from `expectedScenarios`. The pin is a
  // guard against a scenario appearing or vanishing unnoticed; printing it here
  // would let a stale pin quietly become a wrong number on the page.
  const cards = MANUAL_PAGES.map((page) => ({
    ...page,
    lede: INTROS[page.slug][0],
    scenarioCount: parseManualPage(page).scenarios.length,
  }));

  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <h1 className="manual-title">{SITE_TITLE}</h1>
        <Prose>
          {INDEX_LEAD.map((paragraph, index) => (
            // Position, not content: two identical paragraphs are legal prose
            // and would collide as keys.
            <p key={index}>{paragraph}</p>
          ))}
        </Prose>
      </Stack>

      {/* Above the cards, and that is the whole point of the block. The three
          cards are a table of contents, which is what a reader wants second;
          what they want first is the thing the contents are about. */}
      <Card className="manual-start">
        <CardTitle>{START_HERE.title}</CardTitle>

        <p>{START_HERE.lede}</p>

        {/* Not a `nav`. The page already has one navigation landmark below, and
            a second unnamed one is noise to anyone listing them — these two are
            a call to action inside the prose, not a section of the site. */}
        <div className="manual-start__links">
          {/* The tour leads. Both destinations are the console in the end, and
              this is the one that arrives there knowing what to look at. */}
          <Link as={NextLink} href={`/${TOUR_SLUG}`}>
            {START_HERE.tour}
          </Link>
          {/* No `as`: a different deployment, so this is a real anchor and
              `next/link` would be prefetching an origin it cannot route to. */}
          <Link href={CONSOLE_URL}>{START_HERE.console}</Link>
        </div>
      </Card>

      {/* A plain landmark rather than `<Stack as="nav">`: Stack forwards no rest
          props, so an `aria-label` on it is dropped without a word from either
          the compiler or the render — and the footer's nav is unnamed too, which
          would leave the page with two navigation landmarks and no way to tell
          them apart. The grid below already supplies the layout Stack would. */}
      <nav aria-label="Manual pages">
        <div className="manual-index">
          {cards.map((card) => (
            <Card key={card.slug} className="manual-index__card">
              <CardTitle>
                <Link as={NextLink} href={`/${card.slug}`}>
                  {card.title}
                </Link>
              </CardTitle>

              <p>{card.lede}</p>

              <div className="manual-index__meta">
                <Badge>{card.scenarioCount} scenarios</Badge>
              </div>
            </Card>
          ))}
        </div>
      </nav>

      {/* Last, and a section rather than more lead. What this manual is answers
          a question the arriving reader does not have yet; the ones who do have
          it have scrolled past everything above to find it. */}
      <Stack as="section" gap={3} className="manual-about">
        <h2 className="manual-about__title">About this manual</h2>
        <Prose>
          {ABOUT_MANUAL.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </Prose>
      </Stack>
    </Stack>
  );
}

import NextLink from 'next/link';
import { Badge, Card, CardTitle, Link, Prose, Stack } from '@gate/ui';
import { INDEX_LEAD, INTROS } from '@/content/intros';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';
import { SITE_TITLE } from '@/lib/site';

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
    </Stack>
  );
}

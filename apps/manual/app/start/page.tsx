import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Card, CardTitle, Link, Prose, Stack, StepList } from '@gate/ui';
import { TOUR_LEAD, TOUR_TITLE, TOUR_TRAILER } from '@/content/tour';
import { resolveTour } from '@/lib/tour';

export const metadata: Metadata = { title: TOUR_TITLE };

/**
 * The on-boarding tour: the one page here that tells a newcomer what to do
 * rather than what the console must do.
 *
 * It does not photograph the console, and that is the design rather than a
 * shortcut. A capture of a console is stale the day the console is redesigned
 * and says nothing about it; a link into the deployed instance is the console.
 * The repository already serves one on committed sample data, so every step
 * below lands a reader in the real thing, in the state the step describes.
 *
 * Two shipped scenarios are what make those links a guarantee instead of a
 * hope — "The selected job tab is a link" and "A shared link restores the modal
 * state". The console mirrors its position into the address because the gate
 * makes it, which is the same reason the steps under each sentence are the
 * `.feature` file's own.
 *
 * An `<ol>` rather than a stack of cards: these run in order, and the numbering
 * is the list's, drawn by a CSS counter. Nothing here animates — `/start` is a
 * page a reader arrives at, not a thing that performs on arrival.
 */
export default function StartPage() {
  const steps = resolveTour();

  return (
    <Stack gap={10}>
      <Stack gap={4}>
        <h1 className="manual-title">{TOUR_TITLE}</h1>
        <Prose>
          <p>{TOUR_LEAD}</p>
        </Prose>
      </Stack>

      <ol className="manual-tour">
        {steps.map((step) => (
          // By title, not position: the titles are distinct by construction —
          // `__tests__/tour.test.ts` says so — and a positional key renumbers
          // every step below an insertion.
          <li key={step.title} className="manual-tour__step">
            <Card className="manual-tour__card">
              <CardTitle>{step.title}</CardTitle>

              <p>{step.lede}</p>

              {/* The scenario's own steps, rendered by the molecule the
                  reference pages use. Labelled, because without a label this
                  reads as more instructions from the paragraph above rather
                  than as the requirement standing behind it. */}
              <div className="manual-tour__scenario">
                <span className="manual-tour__scenario-label">
                  Checked at merge by “{step.scenario}”
                </span>
                <StepList
                  steps={step.steps.map((line) => ({
                    keyword: line.keyword,
                    meaning: line.keywordType,
                    text: line.text,
                  }))}
                />
              </div>

              {/* No `as`: the console is a different deployment, so this is a
                  real anchor and `next/link` would prefetch an origin this app
                  cannot route to. */}
              <Link href={step.href} className="manual-tour__action">
                {step.action}
              </Link>
            </Card>
          </li>
        ))}
      </ol>

      <Prose>
        <p>
          {TOUR_TRAILER.before}{' '}
          <Link as={NextLink} href="/">
            {TOUR_TRAILER.link}
          </Link>
          {TOUR_TRAILER.after}
        </p>
      </Prose>
    </Stack>
  );
}

import { cache } from 'react';
import { TOUR, type TourStep } from '@/content/tour';
import { findManualPage } from '@/lib/allowlist';
import { parseManualPage, type ManualStep } from '@/lib/features';
import { CONSOLE_URL } from '@/lib/site';

/** Spelled once, because the throw below builds a multi-line message and an
 *  inline escape is the thing a careless rewrite eats first. */
const NEWLINE = String.fromCharCode(10);

/** An authored step, joined to the scenario that vouches for it. */
export interface ResolvedTourStep extends TourStep {
  /** The absolute address, `path` resolved against the deployed console. */
  href: string;
  /** The anchoring scenario's real steps, as the `.feature` file writes them. */
  steps: readonly ManualStep[];
}

/**
 * One step, joined — and the point at which the tour refuses to be wrong.
 *
 * `parseManualPage` is the same parse the reference pages are built from, so a
 * step's rendered Gherkin is the `.feature` file's, read at build time — it
 * cannot drift for the reason those pages cannot.
 *
 * What it can do is dangle. A scenario renamed or deleted leaves the authored
 * sentence above it pointing at nothing, and the honest failure for that is
 * loud: this throws, `app/start/page.tsx` calls it during the build, and the
 * build stops. Silently dropping the step would publish a tour missing a link
 * with nobody told; rendering the sentence alone would publish a promise the
 * suite no longer makes.
 *
 * The message names what it looked for and lists what the feature actually has,
 * because the fix is almost always a rename and the new name is right there.
 *
 * Exported one step at a time as well as whole, so the throw itself is
 * reachable from a test: `resolveTour` closes over the real `TOUR`, and a
 * guard nothing can drive red is a guard nobody should trust.
 */ export function resolveStep(step: TourStep): ResolvedTourStep {
  const page = findManualPage(step.slug);

  // Unreachable through the type — `slug` is `ManualSlug` — but `MANUAL_PAGES`
  // is an array that a future edit could shorten without the union noticing.
  if (!page) {
    throw new Error(
      `Tour step "${step.title}" names the page "${step.slug}", which the allowlist does not publish.`,
    );
  }

  const { scenarios } = parseManualPage(page);
  const found = scenarios.find((scenario) => scenario.name === step.scenario);

  if (!found) {
    const names = scenarios.map((scenario) => `  - ${scenario.name}`).join(NEWLINE);

    throw new Error(
      `Tour step "${step.title}" anchors on the scenario "${step.scenario}", ` +
        `which ${page.featurePath} no longer has. Its scenarios are:${NEWLINE}${names}`,
    );
  }

  return {
    ...step,
    href: new URL(step.path, CONSOLE_URL).toString(),
    steps: found.steps,
  };
}

/** Every step, in authored order. */
export const resolveTour = cache((): readonly ResolvedTourStep[] =>
  TOUR.map(resolveStep),
);

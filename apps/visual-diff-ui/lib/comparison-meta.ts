import type { Metadata } from 'next';
import { comparableVariants, comparisonPath, comparisonTitle } from './comparison';
import { readReport, resolveDataDir } from './data';
import { formatPixels } from './report-view';
import { compared } from './shots';
import type { Variant } from './summary';
import { NOT_FOUND_TITLE } from './site';

/**
 * What a comparison says about itself where it is not on screen: a browser tab,
 * and a link preview in a chat or a feed.
 *
 * The title is the modal's own heading, so the tab, the card and the dialog say
 * one sentence. The description says what moved, in the words the modal's
 * metric line uses — and says nothing about pixels where there was no second
 * shot to count them against.
 */
export function comparisonCopy(
  reportId: string,
  variant: Variant,
): { title: string; description: string } {
  const title = comparisonTitle(variant);
  const verdict = compared(variant.bucket)
    ? `${formatPixels(variant.overlapDiffPixels)} px differ in the shared area`
    : `${variant.bucket} — one side has no shot to compare`;

  return { title, description: `${verdict}. Report ${reportId}.` };
}

/** The comparable variant a key names in a report, or null for none. */
export async function findComparison(
  reportId: string,
  key: string,
): Promise<Variant | null> {
  const { dir } = await resolveDataDir();
  const report = await readReport(dir, reportId);
  if (!report) return null;

  return comparableVariants(report.variants).find((entry) => entry.key === key) ?? null;
}

/**
 * Both comparison routes' `generateMetadata`: the cold-loaded page, which is
 * what an unfurler fetches, and the intercepted modal, which retitles the tab.
 *
 * A miss titles the tab the way every other miss in the console does. The card
 * itself is `opengraph-image.tsx` beside the page, which Next adds to this.
 */
export async function comparisonMetadata(
  params: Promise<{ id: string; key: string }>,
): Promise<Metadata> {
  const { id, key } = await params;
  const variant = await findComparison(id, key);
  if (!variant) return { title: NOT_FOUND_TITLE };

  const { title, description } = comparisonCopy(id, variant);
  const url = comparisonPath(id, key);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

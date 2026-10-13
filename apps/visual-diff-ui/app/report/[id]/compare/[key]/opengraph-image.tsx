import { notFound } from 'next/navigation';
import { comparisonCopy, findComparison } from '@/lib/comparison-meta';
import { resolveDataDir } from '@/lib/data';
import {
  comparisonCardResponse,
  OG_ALT,
  OG_CONTENT_TYPE,
  OG_SIZE,
  readPanels,
} from '@/lib/og';
import { SITE_URL } from '@/lib/site';

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * The card a shared comparison unfurls with. Rendered per request, from the
 * same data directory the page reads — a report is only ever written once, so
 * a card cached by an unfurler cannot go stale under its URL.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ id: string; key: string }>;
}) {
  const { id, key } = await params;
  const variant = await findComparison(id, key);
  if (!variant) notFound();

  const { dir } = await resolveDataDir();

  return comparisonCardResponse({
    title: comparisonCopy(id, variant).title,
    reportId: id,
    host: SITE_URL.host,
    panels: await readPanels(dir, id, variant),
  });
}

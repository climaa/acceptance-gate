import type { Metadata } from 'next';
import { parseVariantKey } from '@gate/visual-diff/policy';
import { SetLabelSchema } from './job-contract';
import { pageMetadata } from './share';
import { shotTitle, shotViewHref } from './shots';
import { NOT_FOUND_TITLE } from './site';
import { storyTitle } from './title';

/**
 * Both shot routes' `generateMetadata`: the cold-loaded page and the
 * intercepted modal.
 *
 * Read off the address alone — a label and a variant key already say which
 * story, viewport and theme — so a tab is titled without a second read of the
 * set. A label or key that is not one titles the tab the way every other miss
 * does; whether the shot exists is the page's question, answered by its
 * `notFound()`.
 */
export async function shotMetadata(
  params: Promise<{ label: string; key: string }>,
): Promise<Metadata> {
  const { label, key } = await params;
  const cell = parseVariantKey(key);
  if (!SetLabelSchema.safeParse(label).success || cell === null) {
    return { title: NOT_FOUND_TITLE };
  }

  const title = shotTitle(
    storyTitle(cell.id),
    cell.viewport,
    cell.theme,
    label,
    cell.locale,
  );

  return pageMetadata({
    path: shotViewHref(label, key),
    title,
    description: `${title}: one screenshot, beside its design board.`,
  });
}

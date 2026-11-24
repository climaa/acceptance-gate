import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site.ts';
import { loadWorkspaceParams } from './workspace-view';

/**
 * Every address census has: the home, and one page per workspace the committed
 * measurement lists. Read from the same params `generateStaticParams` returns,
 * so a workspace with a page cannot be left out of here.
 *
 * The home's filtered views are absent: a `?dimension=` is the same page to its
 * canonical. No `lastModified`, as in apps/manual: the page is regenerated about
 * daily, and that date would claim a change the measurement did not make.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const params = await loadWorkspaceParams();

  return [
    { url: absoluteUrl('/') },
    ...params.map(({ workspace }) => ({ url: absoluteUrl(`/${workspace}`) })),
  ];
}

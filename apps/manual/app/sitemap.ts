import type { MetadataRoute } from 'next';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { absoluteUrl } from '@/lib/site';

/**
 * Every address this manual has: the index, and one page per allowlisted
 * feature. Derived from `MANUAL_PAGES` rather than listed again, so a page added
 * there cannot be left out of here — the same array `generateStaticParams` reads.
 *
 * No `lastModified`. A page's content is its `.feature` file, and the honest
 * date would be that file's last commit, which this app does not read — a build
 * timestamp would claim every page changed on every deploy, which is worse than
 * saying nothing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/') },
    ...MANUAL_PAGES.map((page) => ({ url: absoluteUrl(`/${page.slug}`) })),
  ];
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ManualPageScreen } from '@/components/ManualPageScreen';
import { INTROS } from '@/content/intros';
import { findManualPage, MANUAL_PAGES } from '@/lib/allowlist';
import { pageMetadata } from '@/lib/share';

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

  // The intro's first paragraph is the page's lede, and the one the index's card
  // for it already prints.
  return page
    ? pageMetadata({
        path: `/${page.slug}`,
        title: page.title,
        description: INTROS[page.slug][0],
      })
    : {};
}

export default async function ManualPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = findManualPage(slug);

  if (!page) notFound();

  return <ManualPageScreen page={page} />;
}

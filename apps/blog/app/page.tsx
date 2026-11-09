import type { Metadata } from 'next';
import { HomeScreen } from '@/components/HomeScreen';
import { getAllPosts } from '@/lib/posts';
import { pageMetadata } from '@/lib/share';
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION } from '@/lib/site';

/**
 * The home page says where it lives. Without these it inherited the layout's
 * metadata, which names no page, so `/` went out with no `og:url` and no
 * canonical — and a link-preview fetcher or a search engine reaching it through
 * a `?utm_source=…` link had no address to fold it back onto.
 * The title and description stay the layout's: they already describe this page.
 */
export const metadata: Metadata = pageMetadata({
  path: '/',
  title: { absolute: SITE_DEFAULT_TITLE },
  description: SITE_DESCRIPTION,
});

export default function HomePage() {
  return <HomeScreen posts={getAllPosts().slice(0, 4)} />;
}

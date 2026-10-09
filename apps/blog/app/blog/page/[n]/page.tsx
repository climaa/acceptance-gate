import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { BlogIndexTemplate, Pagination } from '@gate/ui';
import { listedPost } from '@/lib/listing';
import {
  blogPagePath,
  laterPages,
  pageCount,
  pageOf,
  parseLaterPage,
} from '@/lib/paging';
import { getAllPosts } from '@/lib/posts';

// The page's `<title>` names the page it is, so two tabs of the index read apart.
const pageTitle = (page: number) => `Blog, page ${page}`;

const pagePosition = (page: number, total: number) => `Page ${page} of ${total}`;

/** Pages 2 and up. Page 1 is `/blog`, and `/blog/page/1` redirects there (next.config). */
export function generateStaticParams() {
  return laterPages(getAllPosts().length).map((page) => ({ n: String(page) }));
}

export async function generateMetadata({
  params,
}: PageProps<'/blog/page/[n]'>): Promise<Metadata> {
  const { n } = await params;
  const page = parseLaterPage(n, getAllPosts().length);
  if (!page) return {};

  return {
    title: pageTitle(page),
    description: 'Posts on frontend, automated testing and coding agents.',
    alternates: { canonical: blogPagePath(page) },
  };
}

export default async function BlogPagePage({ params }: PageProps<'/blog/page/[n]'>) {
  const { n } = await params;
  const posts = getAllPosts();
  const page = parseLaterPage(n, posts.length);
  // A page past the last one, or a spelling the sitemap never wrote, has no
  // page. The status line is proxy.ts's to set; this is what renders under it.
  if (!page) notFound();

  const total = pageCount(posts.length);

  return (
    <BlogIndexTemplate
      title="Blog"
      intro={pagePosition(page, total)}
      posts={pageOf(posts, page).map(listedPost)}
      // Unreachable: a later page exists only while it has posts. Kept as the
      // slot the template exists to have filled.
      empty="No posts on this page."
      pagination={
        <Pagination page={page} pageCount={total} hrefFor={blogPagePath} as={NextLink} />
      }
    />
  );
}

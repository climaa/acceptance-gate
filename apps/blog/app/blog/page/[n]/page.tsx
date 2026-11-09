import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BlogIndexScreen } from '@/components/BlogIndexScreen';
import { blogPagePath, laterPages, parseLaterPage } from '@/lib/paging';
import { getAllPosts } from '@/lib/posts';
import { indexDescription, pageMetadata } from '@/lib/share';

// The page's `<title>` names the page it is, so two tabs of the index read apart.
const pageTitle = (page: number) => `Blog, page ${page}`;

/** Pages 2 and up. Page 1 is `/blog`, and `/blog/page/1` redirects there (next.config). */
export function generateStaticParams() {
  return laterPages(getAllPosts().length).map((page) => ({ n: String(page) }));
}

export async function generateMetadata({
  params,
}: PageProps<'/blog/page/[n]'>): Promise<Metadata> {
  const { n } = await params;
  const total = getAllPosts().length;
  const page = parseLaterPage(n, total);
  if (!page) return {};

  return pageMetadata({
    path: blogPagePath(page),
    title: pageTitle(page),
    description: indexDescription(page, total),
  });
}

export default async function BlogPagePage({ params }: PageProps<'/blog/page/[n]'>) {
  const { n } = await params;
  const posts = getAllPosts();
  const page = parseLaterPage(n, posts.length);
  if (!page) notFound();

  return <BlogIndexScreen posts={posts} page={page} />;
}

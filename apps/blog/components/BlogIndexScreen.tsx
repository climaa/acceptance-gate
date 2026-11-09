import NextLink from 'next/link';
import { BlogIndexTemplate, Pagination } from '@gate/ui';
import { listedPost } from '@/lib/listing';
import { blogPagePath, pageCount, pageOf } from '@/lib/paging';
import type { PostSummary } from '@/lib/posts';

const pagePosition = (page: number, total: number) => `Page ${page} of ${total}`;

/**
 * `/blog` and `/blog/page/[n]`: one page of the index, given every post and the
 * page number. Page 1 names no position, since it is the index itself; later pages
 * say where the reader is. Apart from the routes so a screen story can draw it
 * without reading `content/`.
 */
export function BlogIndexScreen({
  posts,
  page,
}: {
  posts: readonly PostSummary[];
  page: number;
}) {
  const total = pageCount(posts.length);

  return (
    <BlogIndexTemplate
      title="Blog"
      {...(page === 1 ? {} : { intro: pagePosition(page, total) })}
      posts={pageOf(posts, page).map(listedPost)}
      empty={page === 1 ? 'No posts published yet.' : 'No posts on this page.'}
      pagination={
        <Pagination page={page} pageCount={total} hrefFor={blogPagePath} as={NextLink} />
      }
    />
  );
}

import type { Metadata } from 'next';
import NextLink from 'next/link';
import { BlogIndexTemplate, Pagination } from '@gate/ui';
import { listedPost } from '@/lib/listing';
import { blogPagePath, pageCount, pageOf } from '@/lib/paging';
import { getAllPosts } from '@/lib/posts';
import { indexDescription, pageMetadata } from '@/lib/share';

export const metadata: Metadata = pageMetadata({
  path: blogPagePath(1),
  title: 'Blog',
  description: indexDescription(1, getAllPosts().length),
});

/**
 * Page 1 of the index. The later pages live at `/blog/page/[n]`; this route keeps
 * the address the index has always had, and the control below the list is what
 * says there is more.
 */
export default function BlogIndexPage() {
  const posts = getAllPosts();
  const total = pageCount(posts.length);

  return (
    <BlogIndexTemplate
      title="Blog"
      posts={pageOf(posts, 1).map(listedPost)}
      empty="No posts published yet."
      pagination={
        <Pagination page={1} pageCount={total} hrefFor={blogPagePath} as={NextLink} />
      }
    />
  );
}

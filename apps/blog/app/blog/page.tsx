import type { Metadata } from 'next';
import { BlogIndexScreen } from '@/components/BlogIndexScreen';
import { blogPagePath } from '@/lib/paging';
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
  return <BlogIndexScreen posts={getAllPosts()} page={1} />;
}

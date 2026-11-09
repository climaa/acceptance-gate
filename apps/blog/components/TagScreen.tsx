import NextLink from 'next/link';
import { BlogIndexTemplate } from '@gate/ui';
import { tagPath } from '@/lib/post-paths';
import type { PostSummary } from '@/lib/posts';

/** The heading a tag's page carries, and its `<title>` too: the same sentence, so
 *  a crawler that reads one against the other does not find two. */
export const tagTitle = (label: string) => `Posts tagged ${label}`;

const postCount = (total: number) => `${total} ${total === 1 ? 'post' : 'posts'}`;

/** `/tags/[tag]`: every post carrying one tag, given its label and the posts.
 *  Apart from the route so a screen story can draw it without reading `content/`. */
export function TagScreen({
  label,
  posts,
}: {
  label: string;
  posts: readonly PostSummary[];
}) {
  return (
    <BlogIndexTemplate
      title={tagTitle(label)}
      intro={postCount(posts.length)}
      posts={posts.map((post) => ({
        title: post.title,
        description: post.description,
        href: `/blog/${post.slug}`,
        date: post.date,
        readingMinutes: post.readingMinutes,
        tags: post.tags,
        tagHref: tagPath,
        as: NextLink,
      }))}
      empty={`No posts tagged ${label} yet.`}
    />
  );
}

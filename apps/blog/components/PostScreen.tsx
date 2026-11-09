import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { PostTemplate } from '@gate/ui';
import { tagPath } from '@/lib/post-paths';
import type { PostSummary } from '@/lib/posts';

/**
 * `/blog/[slug]`: one article, given its frontmatter and its rendered body. The
 * body arrives as children because the route compiles MDX on the server, which a
 * screen story, rendering in a browser, cannot; the story hands it the same
 * elements the compiled body is made of.
 */
export function PostScreen({
  post,
  children,
}: {
  post: Pick<PostSummary, 'title' | 'date' | 'readingMinutes' | 'tags'>;
  children: ReactNode;
}) {
  return (
    <PostTemplate
      title={post.title}
      date={post.date}
      readingMinutes={post.readingMinutes}
      tags={post.tags}
      tagHref={tagPath}
      as={NextLink}
    >
      {children}
    </PostTemplate>
  );
}

import type { ReactNode } from 'react';

import { EmptyState } from '../../atoms/EmptyState/EmptyState';
import { Stack } from '../../atoms/Stack/Stack';
import { PostCard, type PostCardProps } from '../../molecules/PostCard/PostCard';

/**
 * `headingLevel` is the template's to give, not the caller's: the title above the
 * list is the page's `<h1>`, so every card below it is an `<h2>`. The level is the
 * one part of a card this layout already knows.
 */
type BlogIndexPost = Omit<PostCardProps, 'headingLevel'>;

export interface BlogIndexTemplateProps {
  title: string;
  intro?: ReactNode;
  posts: BlogIndexPost[];
  /**
   * What the empty state says. A slot rather than a string this package writes:
   * `/blog` and `/tags/[tag]` are empty for different reasons, and neither
   * wording belongs to the design system.
   */
  empty?: ReactNode;
  className?: string;
}

/** True of any empty list of posts, which is all a fallback can be. */
const DEFAULT_EMPTY_MESSAGE = 'No posts yet.';

/**
 * Post-list page layout: a heading, an optional intro, and one `PostCard` per post
 * — or an `EmptyState` when there are none.
 *
 * A template owns arrangement and nothing else: it fetches nothing, is not async
 * and receives every post as a prop, which is what lets `/blog`, `/tags/[tag]` and
 * a Storybook story render the same component against their own data.
 */
export function BlogIndexTemplate({
  title,
  intro,
  posts,
  empty,
  className,
}: BlogIndexTemplateProps) {
  return (
    <Stack gap={8} className={['ds-blog-index', className].filter(Boolean).join(' ')}>
      <Stack gap={2}>
        <h1 className="ds-blog-index__title">{title}</h1>
        {intro && <p className="ds-blog-index__intro">{intro}</p>}
      </Stack>

      {posts.length > 0 ? (
        <Stack gap={3} className="ds-blog-index__list">
          {posts.map((post) => (
            <PostCard key={post.href} {...post} headingLevel="h2" />
          ))}
        </Stack>
      ) : (
        <EmptyState message={empty ?? DEFAULT_EMPTY_MESSAGE} />
      )}
    </Stack>
  );
}

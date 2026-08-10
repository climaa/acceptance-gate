import type { ElementType, ReactNode } from 'react';

import { Prose, Stack } from '../../atoms';
import { PostMeta, TagList } from '../../molecules';

export interface PostTemplateProps {
  title: string;
  /** ISO `YYYY-MM-DD`, forwarded to `PostMeta`. */
  date: string;
  readingMinutes: number;
  tags: string[];
  /**
   * Forwarded to `TagList`, and through it to every `Tag`, so an app names its
   * router link once — `as={NextLink}` — and this package still depends on no
   * framework.
   */
  as?: ElementType;
  /**
   * The article body, already rendered. The template takes no source and knows
   * nothing about MDX: importing the pipeline would make it unrenderable in
   * Storybook, which is the reason a template exists at all.
   */
  children: ReactNode;
  className?: string;
}

/**
 * The article page's layout: title, meta and tags in a header, then the body.
 *
 * The `<h1>` is the page's only top-level heading — an MDX body starts at `h2`
 * and `.ds-prose` is written against that. The body's measure is `Prose`'s
 * `--width-prose`, declared there and deliberately not repeated here.
 */
export function PostTemplate({
  title,
  date,
  readingMinutes,
  tags,
  as,
  children,
  className,
}: PostTemplateProps) {
  return (
    <Stack
      as="article"
      gap={8}
      className={['ds-post-template', className].filter(Boolean).join(' ')}
    >
      <Stack as="header" gap={3}>
        <h1 className="ds-post-template__title">{title}</h1>
        <PostMeta date={date} readingMinutes={readingMinutes} />
        <TagList tags={tags} as={as} />
      </Stack>

      <Prose>{children}</Prose>
    </Stack>
  );
}

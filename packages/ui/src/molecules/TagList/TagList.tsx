import type { ElementType } from 'react';

import { Stack } from '../../atoms/Stack/Stack';
import { Tag } from '../../atoms/Tag/Tag';

export interface TagListProps {
  tags: string[];
  /**
   * Builds the href for each tag. Defaults to `/tags/${encodeURIComponent(tag)}`
   * so callers can render a plain list without supplying one; the prop exists so
   * this package never hardcodes an app's route shape.
   */
  hrefFor?: (tag: string) => string;
  /**
   * Forwarded straight through to every `Tag`, so a caller supplies a router
   * link (e.g. `NextLink`) once for the whole list rather than per item.
   */
  as?: ElementType;
  className?: string;
}

const defaultHrefFor = (tag: string): string => `/tags/${encodeURIComponent(tag)}`;

/**
 * Semantic list of `Tag` links — the row rendered as "testing · agents · ci" on
 * the board. Renders `<ul>`/`<li>`, not a bare row of anchors, so a screen reader
 * announces the count. An empty `tags` array renders nothing at all, not an
 * empty list.
 */
export function TagList({ tags, hrefFor = defaultHrefFor, as, className }: TagListProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <Stack
      as="ul"
      direction="row"
      gap={2}
      wrap
      className={['ds-tag-list', className].filter(Boolean).join(' ')}
    >
      {tags.map((tag) => (
        <li key={tag}>
          <Tag as={as} href={hrefFor(tag)}>
            {tag}
          </Tag>
        </li>
      ))}
    </Stack>
  );
}

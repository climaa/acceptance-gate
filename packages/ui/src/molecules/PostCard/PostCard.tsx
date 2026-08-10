import type { ElementType } from 'react';

import { Link } from '../../atoms/Link/Link';
import { Stack } from '../../atoms/Stack/Stack';
import { Card } from '../Card/Card';
import { PostMeta } from '../PostMeta/PostMeta';
import { TagList } from '../TagList/TagList';

export interface PostCardProps {
  title: string;
  description: string;
  /** Where the whole card navigates — carried by the title link. */
  href: string;
  /** ISO `YYYY-MM-DD`, handed to `PostMeta` verbatim. */
  date: string;
  readingMinutes: number;
  tags: string[];
  /**
   * Builds each chip's href, forwarded to `TagList` as its `hrefFor`. An app
   * whose tag route is keyed on a slug needs this: the default builder encodes
   * the display text, and `/tags/visual%20regression` is a second URL for the
   * page `/tags/visual-regression` prerenders.
   */
  tagHref?: (tag: string) => string;
  /**
   * The blog index lists these under its `<h1>` and takes the default; the home
   * page lists them under an existing `<h2>` and needs `'h3'`. Hardcoding either
   * skips a level on one of the two pages, which is a heading-order violation
   * rather than a matter of size — the level is structure, the type scale is CSS.
   */
  headingLevel?: 'h2' | 'h3';
  /**
   * The element or component every link in the card renders as, forwarded to the
   * title link and to `TagList`. An app names its router link once — `as={NextLink}`
   * — and this package still depends on no framework.
   *
   * Not generic the way `Link` is: this molecule passes a fixed set of props to
   * the elements it builds, so there is nothing for the caller's element type to
   * widen.
   */
  as?: ElementType;
  className?: string;
}

/**
 * One post in a list: title, description, `PostMeta` and `TagList` inside a `Card`.
 *
 * The whole card is one link target, but only the title is an anchor — it spans
 * the card through a pseudo-element (see `.ds-post-card__link::after`). Wrapping
 * the card body in a single `<a>`, which is what the blog does today, puts the
 * tag links inside that anchor: nested interactive elements are invalid HTML and
 * the inner link is unreachable. Stretching the title link instead leaves the
 * tags as siblings, so each stays independently clickable.
 */
export function PostCard({
  title,
  description,
  href,
  date,
  readingMinutes,
  tags,
  tagHref,
  headingLevel: Heading = 'h2',
  as,
  className,
}: PostCardProps) {
  return (
    <Card interactive className={['ds-post-card', className].filter(Boolean).join(' ')}>
      <Stack gap={2}>
        <Heading className="ds-post-card__title">
          <Link as={as} href={href} className="ds-post-card__link">
            {title}
          </Link>
        </Heading>

        <p className="ds-post-card__description">{description}</p>

        <PostMeta date={date} readingMinutes={readingMinutes} />

        <TagList tags={tags} hrefFor={tagHref} as={as} className="ds-post-card__tags" />
      </Stack>
    </Card>
  );
}

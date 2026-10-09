import NextLink from 'next/link';
import type { BlogIndexTemplateProps } from '@gate/ui';
import { tagPath, type PostSummary } from './posts';

type ListedPost = BlogIndexTemplateProps['posts'][number];

/**
 * One post as `BlogIndexTemplate` lists it. The index and its later pages hand
 * the template the same shape, and this is the one place the shape is written:
 * the article's address, the prerendered tag route for each chip, and the app's
 * router link, named once rather than per page.
 */
export function listedPost(post: PostSummary): ListedPost {
  return {
    title: post.title,
    description: post.description,
    href: `/blog/${post.slug}`,
    date: post.date,
    readingMinutes: post.readingMinutes,
    tags: post.tags,
    tagHref: tagPath,
    as: NextLink,
  };
}

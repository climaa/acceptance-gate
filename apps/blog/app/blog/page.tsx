import type { Metadata } from 'next';
import NextLink from 'next/link';
import { BlogIndexTemplate } from '@gate/ui';
import { getAllPosts, tagPath } from '@/lib/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Posts on frontend, automated testing and coding agents.',
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <BlogIndexTemplate
      title="Blog"
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
      empty="No posts published yet."
    />
  );
}

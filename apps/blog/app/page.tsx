import NextLink from 'next/link';
import { EmptyState, PostCard, Stack } from '@gate/ui';
import { getAllPosts, tagPath } from '@/lib/posts';

export default function HomePage() {
  const posts = getAllPosts().slice(0, 4);

  return (
    <Stack gap={12}>
      <Stack gap={4} as="section">
        <h1 className="hero__title">I build frontends you can verify.</h1>
        <p className="hero__lead">
          Web developer in Barcelona. Next.js, TypeScript and one specific obsession: that
          quality is a property of the pipeline, not a phase at the end. I write about
          Cypress with Gherkin, visual regression, and what changes when agents write part
          of the code.
        </p>
      </Stack>

      <Stack gap={5} as="section">
        <h2 className="section-title">Latest posts</h2>

        {posts.length === 0 ? (
          <EmptyState message="No posts published yet." />
        ) : (
          <Stack gap={3}>
            {posts.map((post) => (
              // h3, not the default h2: these sit under the section heading
              // above, and skipping a level is a heading-order violation.
              <PostCard
                key={post.slug}
                headingLevel="h3"
                title={post.title}
                description={post.description}
                href={`/blog/${post.slug}`}
                date={post.date}
                readingMinutes={post.readingMinutes}
                tags={post.tags}
                tagHref={tagPath}
                as={NextLink}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

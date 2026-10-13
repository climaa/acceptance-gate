import type { Metadata } from 'next';
import NextLink from 'next/link';
import { EmptyState, PostCard, Stack } from '@gate/ui';
import { getAllPosts, tagPath } from '@/lib/posts';
import { SITE_ALTERNATES, SITE_OPEN_GRAPH } from '@/lib/site';

/**
 * The home page says where it lives. Without these it inherited the layout's
 * metadata, which names no page, so `/` went out with no `og:url` and no
 * canonical — and a link-preview fetcher or a search engine reaching it through
 * a `?utm_source=…` link had no address to fold it back onto.
 * The title and description stay the layout's: they already describe this page.
 */
export const metadata: Metadata = {
  openGraph: { ...SITE_OPEN_GRAPH, url: '/' },
  alternates: { ...SITE_ALTERNATES, canonical: '/' },
};

export default function HomePage() {
  const posts = getAllPosts().slice(0, 4);

  return (
    <Stack gap={12}>
      <Stack gap={4} as="section">
        <h1 className="hero__title">I build frontends you can verify.</h1>
        <p className="hero__lead">
          Senior frontend engineer in Barcelona. Next.js, TypeScript and one specific
          obsession: that quality is a property of the pipeline, not a phase at the end. I
          write about Cypress with Gherkin, visual regression, and what changes when
          agents write part of the code.
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

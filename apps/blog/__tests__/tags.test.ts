import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { BlogIndexTemplateProps } from '@gate/ui';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import TagPage, { generateMetadata, generateStaticParams } from '../app/tags/[tag]/page';
import { getAllTags, getPostsByTag, getTagLabel, tagSlug } from '../lib/posts';

/**
 * Which tag pages exist, and which posts each one lists.
 *
 * The URL carries a slug and the frontmatter carries display text, so the tag
 * set below is derived by reading content/posts directly rather than by calling
 * the accessors under test — `getAllTags()` deciding a tag exists is exactly the
 * claim these tests have to be able to contradict.
 */

const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

interface RawPost {
  tags: string[];
  draft: boolean;
}

const rawPosts: RawPost[] = fs
  .readdirSync(POSTS_DIR)
  .filter((file) => /\.mdx?$/.test(file))
  .map((file) => {
    const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    return { tags: (data.tags ?? []) as string[], draft: data.draft === true };
  });

const slugsOf = (posts: RawPost[]) =>
  [...new Set(posts.flatMap((post) => post.tags).map(tagSlug))].sort();

const publishedSlugs = slugsOf(rawPosts.filter((post) => !post.draft));

/** Tags no published post carries — the routes that must not exist. */
const draftOnlySlugs = slugsOf(rawPosts.filter((post) => post.draft)).filter(
  (slug) => !publishedSlugs.includes(slug),
);

/**
 * Named rather than indexed off the lists above, the way feeds.test.ts names its
 * draft slugs: the cases below read as cases, and `noUncheckedIndexedAccess` makes
 * `publishedSlugs[0]` a `string | undefined` at every call site. The guard test
 * below fails first if content stops carrying them.
 */
const PUBLISHED_TAG = { slug: 'agents', label: 'agents' };
const MULTI_WORD_TAG = { slug: 'visual-regression', label: 'visual regression' };
/**
 * `fixture` is the one draft-only tag that is stable by contract: it belongs to
 * e2e-draft-fixture.mdx, whose own suite pins `draft: true` forever. Every other
 * candidate goes stale the day the post carrying it is published — which is
 * exactly how `cypress` broke, when gherkin-specs-that-survive.mdx shipped.
 */
const DRAFT_ONLY_TAG = 'fixture';

/**
 * `searchParams` beside `params` because `PageProps<'/tags/[tag]'>` is the whole
 * contract Next hands a page, not the half this one reads. The page itself never
 * touches it: under `cacheComponents` reading it would open a dynamic hole in a
 * route built to prerender.
 */
const propsFor = (tag: string) => ({
  params: Promise.resolve({ tag }),
  searchParams: Promise.resolve({}),
});

/**
 * The props the page hands `BlogIndexTemplate` — a page renders nothing else.
 * Named as the template's own type so the assertions below read the heading, the
 * intro and the post list under the names the template gives them.
 */
const renderTagPage = async (tag: string): Promise<BlogIndexTemplateProps> =>
  (await TagPage(propsFor(tag))).props;

describe('content/posts', () => {
  // A suite whose fixtures no longer exist would pass while protecting nothing —
  // the same guard content.test.ts carries.
  it('finds the tags it was written against', () => {
    expect(publishedSlugs).toContain(PUBLISHED_TAG.slug);
    expect(publishedSlugs).toContain(MULTI_WORD_TAG.slug);
    expect(draftOnlySlugs).toContain(DRAFT_ONLY_TAG);
  });
});

describe('tagSlug', () => {
  // The whole reason the route matches on a slug: `/tags/CI` and `/tags/ci` name
  // one page, and treating the URL as display text is what makes them two.
  it('folds case', () => {
    expect(tagSlug('CI')).toBe(tagSlug('ci'));
  });

  it('hyphenates the whitespace a display tag may carry', () => {
    expect(tagSlug(MULTI_WORD_TAG.label)).toBe(MULTI_WORD_TAG.slug);
  });

  it('ignores surrounding whitespace', () => {
    expect(tagSlug('  agents  ')).toBe('agents');
  });
});

describe('getAllTags', () => {
  it('lists each distinct tag once', () => {
    const tags = getAllTags();

    expect(tags.map((tag) => tag.slug).sort()).toEqual(publishedSlugs);
  });

  it('carries the display text the frontmatter wrote', () => {
    const tags = getAllTags();

    expect(tags).toContainEqual(MULTI_WORD_TAG);
  });

  it('omits a tag no published post carries', () => {
    const tags = getAllTags();

    expect(tags.map((tag) => tag.slug)).not.toContain(DRAFT_ONLY_TAG);
  });
});

describe('getPostsByTag', () => {
  it('matches a tag whatever case the URL carries', () => {
    const posts = getPostsByTag(PUBLISHED_TAG.slug.toUpperCase());

    expect(posts).toEqual(getPostsByTag(PUBLISHED_TAG.slug));
    expect(posts.length).toBeGreaterThan(0);
  });

  it('matches a multi-word tag by its slug', () => {
    const posts = getPostsByTag(MULTI_WORD_TAG.slug);

    expect(posts.flatMap((post) => post.tags)).toContain(MULTI_WORD_TAG.label);
  });

  it('omits drafts', () => {
    expect(getPostsByTag(DRAFT_ONLY_TAG)).toHaveLength(0);
  });

  it('returns nothing for a tag no post carries', () => {
    expect(getPostsByTag('no-such-tag')).toHaveLength(0);
  });
});

describe('getTagLabel', () => {
  it('reads the display text back from a slug', () => {
    expect(getTagLabel(MULTI_WORD_TAG.slug)).toBe(MULTI_WORD_TAG.label);
  });

  it('is null for a tag no published post carries', () => {
    expect(getTagLabel(DRAFT_ONLY_TAG)).toBeNull();
  });
});

describe('generateStaticParams', () => {
  it('prerenders each distinct tag once', () => {
    const params = generateStaticParams();

    expect(params.map((param) => param.tag).sort()).toEqual(publishedSlugs);
  });

  // The edge case the issue names: a tag carried only by a draft has no posts to
  // list, so it must not become a route at all.
  it('prerenders no route for a tag no published post carries', () => {
    const params = generateStaticParams();

    expect(params.map((param) => param.tag)).not.toContain(DRAFT_ONLY_TAG);
  });
});

describe('app/tags/[tag]', () => {
  it('lists the posts carrying the tag', async () => {
    const props = await renderTagPage(PUBLISHED_TAG.slug);

    expect(props.posts.map((post) => post.href)).toEqual(
      getPostsByTag(PUBLISHED_TAG.slug).map((post) => `/blog/${post.slug}`),
    );
  });

  it('titles the page after the tag as the frontmatter writes it', async () => {
    const props = await renderTagPage(MULTI_WORD_TAG.slug);

    expect(props.title).toContain(MULTI_WORD_TAG.label);
  });

  // The board puts a count beside the tag in the hero slot.
  it('counts the posts it lists', async () => {
    const props = await renderTagPage(PUBLISHED_TAG.slug);

    expect(props.intro).toMatch(
      new RegExp(`^${getPostsByTag(PUBLISHED_TAG.slug).length} posts?$`),
    );
  });

  // 404, not an empty index: a tag page that renders for anything a reader types
  // is an unbounded set of thin pages.
  it('404s on a tag no post carries', async () => {
    await expect(renderTagPage('no-such-tag')).rejects.toThrow();
  });

  it('404s on a tag only a draft carries', async () => {
    await expect(renderTagPage(DRAFT_ONLY_TAG)).rejects.toThrow();
  });

  // A card's own chips are `/tags/visual%20regression` — TagList builds them with
  // `encodeURIComponent` — and Next decodes the segment before the page sees it,
  // so the display text arrives here as often as the slug the route prerenders.
  it('resolves the display form of a tag, not only the slug it prerenders', async () => {
    const props = await renderTagPage(MULTI_WORD_TAG.label);

    expect(props.posts).toEqual((await renderTagPage(MULTI_WORD_TAG.slug)).posts);
  });
});

describe('generateMetadata', () => {
  it('names the tag in the title and the description', async () => {
    const metadata = await generateMetadata(propsFor(MULTI_WORD_TAG.slug));

    expect(metadata.title).toContain(MULTI_WORD_TAG.label);
    expect(metadata.description).toContain(MULTI_WORD_TAG.label);
  });

  // Case and the display form both render the slug's page, so the slug is the one
  // URL a crawler should be pointed at.
  it('points the canonical URL at the slug, not at the segment as typed', async () => {
    const metadata = await generateMetadata(propsFor(MULTI_WORD_TAG.label.toUpperCase()));

    expect(metadata.alternates?.canonical).toBe(`/tags/${MULTI_WORD_TAG.slug}`);
  });

  it('is empty for a tag no published post carries', async () => {
    const metadata = await generateMetadata(propsFor(DRAFT_ONLY_TAG));

    expect(metadata).toEqual({});
  });
});

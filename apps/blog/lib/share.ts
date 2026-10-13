import type { Metadata } from 'next';
import {
  cardVersion,
  OG_CONTENT_TYPE,
  OG_SIZE,
  postCardCopy,
  postCardPath,
  SITE_CARD_COPY,
  SITE_CARD_PATH,
} from './og';
import { POSTS_PER_PAGE } from './paging';
import type { Post } from './posts';
import {
  SITE_ALTERNATES,
  SITE_DEFAULT_TITLE,
  SITE_OPEN_GRAPH,
  TITLE_TEMPLATE,
} from './site';

/**
 * What a link to a page shows wherever it is pasted — Upwork, LinkedIn, Slack,
 * X, WhatsApp — and the address every one of them folds it back onto.
 *
 * One function so that no page can set half of it. The ways a preview goes
 * wrong are all omissions: a page with no `og:url` is previewed as the bare
 * host, a page that sets `openGraph` without the site fields loses
 * `og:site_name` (Next merges metadata shallowly, see `SITE_OPEN_GRAPH`), and a
 * card with no alt text is an image of words nobody can hear.
 *
 * English only, so no `hreflang`: `alternates.languages` is where it would go.
 */

export interface ShareImage {
  /** A path; `metadataBase` makes it absolute. */
  url: string;
  alt: string;
}

export interface PageShare {
  /** The page's own address: its canonical and its `og:url`. */
  path: string;
  /** The `<title>` segment the layout's template wraps, or an absolute title. */
  title: string | { absolute: string };
  /** What a preview's headline says, when it is not the document title. */
  shareTitle?: string;
  description: string;
  image?: ShareImage;
  /** A post's article fields. Present only on a post, and only a post is an article. */
  article?: Pick<Post, 'date' | 'updated' | 'tags'>;
}

function versioned(path: string, version: string): string {
  return `${path}?v=${version}`;
}

/** The card every page without one of its own is shared with. */
export const SITE_SHARE_IMAGE: ShareImage = {
  url: versioned(SITE_CARD_PATH, cardVersion(SITE_CARD_COPY)),
  alt: SITE_DEFAULT_TITLE,
};

/** A post's own card, described by the title it draws. */
export function postShareImage(post: Pick<Post, 'slug' | 'title' | 'date' | 'tags'>) {
  return {
    url: versioned(postCardPath(post.slug), cardVersion(postCardCopy(post))),
    alt: post.title,
  } satisfies ShareImage;
}

function documentTitle(title: PageShare['title']): string {
  return typeof title === 'string' ? TITLE_TEMPLATE.replace('%s', title) : title.absolute;
}

/** The `og:image` entry, and the `twitter:image` one, for a card. */
export function shareImages(image: ShareImage) {
  return [{ ...image, ...OG_SIZE, type: OG_CONTENT_TYPE }];
}

export function pageMetadata(page: PageShare): Metadata {
  const { path, title, description, article } = page;
  const shareTitle = page.shareTitle ?? documentTitle(title);
  const images = shareImages(page.image ?? SITE_SHARE_IMAGE);

  return {
    title,
    description,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title: shareTitle,
      description,
      url: path,
      images,
      ...(article
        ? {
            type: 'article',
            publishedTime: article.date,
            // Omitted rather than mirrored from `date` when the post has never
            // been revised: an `article:modified_time` equal to the publish time
            // tells a reader nothing and is indistinguishable from a stale one.
            ...(article.updated ? { modifiedTime: article.updated } : {}),
            tags: article.tags,
          }
        : {}),
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images },
    alternates: { ...SITE_ALTERNATES, canonical: path },
  };
}

/** What every page of the index is a list of. */
const INDEX_SUBJECT = 'Posts on frontend, automated testing and coding agents';

/**
 * One page of the index, by the posts it holds. Each page lists different
 * posts, so each says which — three pages sharing one sentence previewed as
 * three copies of the same link.
 */
export function indexDescription(page: number, total: number): string {
  const first = (page - 1) * POSTS_PER_PAGE + 1;
  const last = Math.min(page * POSTS_PER_PAGE, total);

  return `${INDEX_SUBJECT}: ${first}–${last} of ${total}, newest first.`;
}

/** A tag page, by what it holds and what is newest on it. */
export function tagDescription(label: string, posts: readonly Pick<Post, 'title'>[]) {
  const count = `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`;
  const latest = posts[0];

  return latest
    ? `${count} tagged ${label}, newest first. Latest: ${latest.title}.`
    : `${count} tagged ${label}.`;
}

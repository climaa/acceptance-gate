import type { Metadata } from 'next';
import {
  cardVersion,
  OG_CONTENT_TYPE,
  OG_SIZE,
  SITE_CARD_COPY,
  SITE_CARD_PATH,
} from './og';
import { SITE_DEFAULT_TITLE, SITE_OPEN_GRAPH, TITLE_TEMPLATE } from './site';

/**
 * What a link to a page shows wherever it is pasted — Upwork, LinkedIn, Slack,
 * X, WhatsApp — and the address every one of them folds it back onto.
 *
 * One function so that no page can set half of it, the shape
 * `apps/blog/lib/share.ts` gives the blog. The ways a preview goes wrong are all
 * omissions: a page with no `og:url` is previewed as the bare host, a page that
 * sets `openGraph` without the site fields loses `og:site_name` (Next merges
 * metadata shallowly, see `SITE_OPEN_GRAPH`), and a card with no alt text is an
 * image of words nobody can hear.
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
  description: string;
}

/** The one card this manual has, at an address that moves with its words. */
export const SITE_SHARE_IMAGE: ShareImage = {
  url: `${SITE_CARD_PATH}?v=${cardVersion(SITE_CARD_COPY)}`,
  alt: SITE_DEFAULT_TITLE,
};

/** The `og:image` entry, and the `twitter:image` one, for the card. */
export const SITE_SHARE_IMAGES = [
  { ...SITE_SHARE_IMAGE, ...OG_SIZE, type: OG_CONTENT_TYPE },
];

function documentTitle(title: PageShare['title']): string {
  return typeof title === 'string' ? TITLE_TEMPLATE.replace('%s', title) : title.absolute;
}

export function pageMetadata({ path, title, description }: PageShare): Metadata {
  const shareTitle = documentTitle(title);
  const images = SITE_SHARE_IMAGES;

  return {
    title,
    description,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title: shareTitle,
      description,
      url: path,
      images,
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images },
    alternates: { canonical: path },
  };
}

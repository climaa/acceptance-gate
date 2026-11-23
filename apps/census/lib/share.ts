import type { Metadata } from 'next';

import {
  cardVersion,
  OG_CONTENT_TYPE,
  OG_SIZE,
  SITE_CARD_COPY,
  SITE_CARD_PATH,
} from './og.tsx';
import { SITE_OPEN_GRAPH, SITE_TITLE } from './site.ts';

/**
 * What a link to a page shows wherever it is pasted, and the address every
 * preview folds it back onto. One function so that no page can set half of it,
 * the shape `apps/manual/lib/share.ts` gives the manual: a page with no `og:url`
 * is previewed as the bare host, a page that sets `openGraph` without the site
 * fields loses `og:site_name` (see `SITE_OPEN_GRAPH`), and a card with no alt
 * text is an image of words nobody can hear.
 */

export interface PageShare {
  /** The page's own address: its canonical and its `og:url`. */
  path: string;
  /** The whole `<title>`, as the tab and the preview both read it. */
  title: string;
  description: string;
}

/** The one card census has, at an address that moves with its words. */
export const SITE_SHARE_IMAGE = {
  url: `${SITE_CARD_PATH}?v=${cardVersion(SITE_CARD_COPY)}`,
  alt: `${SITE_TITLE} — ${SITE_CARD_COPY.meta}`,
};

/** The `og:image` entry, and the `twitter:image` one, for the card. */
export const SITE_SHARE_IMAGES = [
  { ...SITE_SHARE_IMAGE, ...OG_SIZE, type: OG_CONTENT_TYPE },
];

export function pageMetadata({ path, title, description }: PageShare): Metadata {
  return {
    title,
    description,
    openGraph: {
      ...SITE_OPEN_GRAPH,
      title,
      description,
      url: path,
      images: SITE_SHARE_IMAGES,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: SITE_SHARE_IMAGES,
    },
    alternates: { canonical: path },
  };
}

import { OG_CONTENT_TYPE, OG_SIZE, ogImageResponse, SITE_CARD_COPY } from '@/lib/og';
import { SITE_TAGLINE, SITE_TITLE } from '@/lib/site';

/**
 * The card every non-post route embeds with: home, /blog, /about and 404.
 * Static — nothing here reads the request.
 */

export const alt = `${SITE_TITLE} — ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return ogImageResponse(SITE_CARD_COPY);
}

import { ogImageResponse, SITE_CARD_COPY } from '@/lib/og';

/**
 * The card every page without one of its own is shared with: home, the index,
 * tag pages, /about, /changelog and 404. Nothing here reads the request, so it
 * prerenders with the deployment.
 */
export async function GET() {
  return ogImageResponse(SITE_CARD_COPY);
}

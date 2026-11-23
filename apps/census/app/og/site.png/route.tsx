import { ogImageResponse, SITE_CARD_COPY } from '@/lib/og.tsx';

/**
 * The card every page of census is shared with. A route handler rather than
 * the `opengraph-image` file convention, whose file-based metadata overrides
 * what a page sets — `lib/share.ts` names this address instead. Nothing here
 * reads the request, so it prerenders with the deployment.
 */
export async function GET() {
  return ogImageResponse(SITE_CARD_COPY);
}

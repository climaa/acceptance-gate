import { siteCardResponse } from '@/lib/og';

/**
 * The card every page without one of its own is shared with: the console, a
 * report, a set and the 404. A route handler rather than the `opengraph-image`
 * file convention, because file-based metadata overrides what a page sets, and
 * each page names this card through `lib/share.ts`. Nothing here reads the
 * request, so it prerenders with the deployment.
 */
export async function GET() {
  return siteCardResponse();
}

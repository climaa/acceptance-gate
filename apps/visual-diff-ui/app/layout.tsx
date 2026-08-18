import type { Metadata } from 'next';
import NextLink from 'next/link';
import { Suspense } from 'react';
import { Badge, SiteHeader } from '@gate/ui';
import { resolveDataDir } from '@/lib/data';
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_TAGLINE,
  SAMPLE_LABEL,
  SAMPLE_NOTE,
} from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
};

/**
 * The badge every screen fed from `fixtures/` carries.
 *
 * Async, and behind its own `<Suspense>`, because `resolveDataDir()` is a
 * request-time answer: rendered inline it would resolve during prerendering,
 * and `next build` runs with no data directory configured — so a deployment
 * with real data would serve a static shell claiming to be sample data, and
 * every e2e world booted off one build would inherit it.
 *
 * `role="status"` with an explicit name: a live region takes its accessible
 * name from a label, not from its contents, and the note beside the badge is
 * the explanation rather than the name.
 */
async function SampleNotice() {
  const { isSample } = await resolveDataDir();
  if (!isSample) return null;

  return (
    <div className="vd-sample" role="status" aria-label={SAMPLE_LABEL}>
      <Badge tone="accent">{SAMPLE_LABEL}</Badge>
      <span className="vd-sample__note">{SAMPLE_NOTE}</span>
    </div>
  );
}

/**
 * The brand line is the console's `h1`: the board draws the wordmark and its
 * tagline as the top row and gives the page no second title, so a heading below
 * it would be a title this design does not have. `/report/[id]` inherits it
 * until the issue that owns that page gives the report its own heading level.
 */
const BRAND = (
  <span className="vd-brand">
    <h1 className="vd-brand__mark">{APP_NAME}</h1>
    <span className="vd-brand__tagline">{APP_TAGLINE}</span>
  </span>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below sets `data-theme` on this element before React sees the
    // document, so the server's markup and the hydrated DOM disagree by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* React hoists the stylesheet link ahead of everything a layout
            renders, so this cannot be written above it. It still resolves the
            theme before the first paint: the parser reaches it while still in
            <head>, and the paint it would otherwise flash through is waiting on
            that same stylesheet. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* `as={NextLink}` once, forwarded to the brand: the design system
            depends on no framework, so this is where the app names its router
            link. The header supplies the skip link and the theme toggle. */}
        <SiteHeader brand={BRAND} as={NextLink} container="full" />

        {/* The id is SkipLink's default target, and the landmark the header's
            first tab stop jumps to. */}
        <main id="main" className="ds-container ds-container--full">
          <Suspense fallback={null}>
            <SampleNotice />
          </Suspense>

          {children}
        </main>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CensusFrame } from '@/components/CensusFrame';
import { FilteredFrame } from '@/components/Filtered';
import { SITE_SHARE_IMAGES } from '@/lib/share.ts';
import { SITE_DESCRIPTION, SITE_OPEN_GRAPH, SITE_TITLE, SITE_URL } from '@/lib/site.ts';
import { loadHomeView } from './home-view';
import { SiteAnalytics } from './site-analytics';
import { THEME_SCRIPT } from './theme';
import './globals.css';

export const metadata: Metadata = {
  // Every absolute URL in the metadata below resolves against this, so it has to
  // name a host that answers — see `lib/site.ts`.
  metadataBase: SITE_URL,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // What a page that names no preview of its own still gets, the 404 among
  // them. Every published page names one through `lib/share.ts`.
  openGraph: { ...SITE_OPEN_GRAPH, images: SITE_SHARE_IMAGES },
  twitter: { card: 'summary_large_image', images: SITE_SHARE_IMAGES },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const view = await loadHomeView();

  return (
    // The script below sets `data-theme` on this element before React sees the
    // document, so the server's markup and the hydrated DOM disagree by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* The query is the browser's: the prerendered frame is the unfiltered one. */}
        <Suspense fallback={<CensusFrame view={view}>{children}</CensusFrame>}>
          <FilteredFrame view={view}>{children}</FilteredFrame>
        </Suspense>

        {/* Production deployments only. The package's own detection keys off
            NODE_ENV, which reads "production" on every preview build too — so
            without this, each login-protected preview would report the reviewer
            clicking through it into the same dataset as the live census.

            Same gate apps/blog, apps/manual and apps/visual-diff-ui use, and the
            reasoning it rests on is measured once for all of them in
            Docs/DevOps/Web Analytics rather than restated here. The short of it:
            what the gate withholds is the component, not a <script> — no build's
            HTML carries the beacon's tag, because the package appends it in an
            effect. Read the network log, not the markup, when checking whether
            this works. */}
        {process.env.VERCEL_ENV === 'production' && <SiteAnalytics />}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CensusFrame } from '@/components/CensusFrame';
import { FilteredFrame } from '@/components/Filtered';
import { loadHomeView } from './home-view';
import { THEME_SCRIPT } from './theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Census',
  description:
    "What this repository's tests, stories, scenarios and code health cover, and every gap left to file.",
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
      </body>
    </html>
  );
}

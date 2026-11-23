import type { Metadata } from 'next';

import { CensusShell } from '@/components/CensusShell';
import { MeasurementBar } from '@/components/MeasurementBar';
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
        <CensusShell dimensions={view.dimensions} githubHref={view.githubHref}>
          <MeasurementBar view={view} />
          {children}
        </CensusShell>
      </body>
    </html>
  );
}

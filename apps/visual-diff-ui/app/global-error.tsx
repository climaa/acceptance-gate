'use client';

import { Button, EmptyState, Stack } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * The boundary of last resort: a throw in the root layout, which `app/error.tsx`
 * renders inside and therefore cannot catch. The layout has a real way to get
 * there — `SampleNotice` awaits `resolveDataDir()`, which reads the filesystem.
 *
 * This file REPLACES the root layout, so what the layout supplies has to be
 * restated: the document, the stylesheet, and the theme. `THEME_SCRIPT` runs
 * again because without it this page would be the one surface in the app whose
 * theme comes from the reader's OS instead of the `[data-theme]` attribute the
 * toggle writes — and a capture pipeline that reads a theme it did not choose
 * is the exact failure CODING_STANDARDS forbids.
 *
 * `<title>` as an element, not a `metadata` export: metadata is unsupported in
 * a Client Component, and an error boundary has to be one.
 *
 * No `SiteHeader`. It is the layout's, and the layout is what just threw.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    // Matches the root layout: the script below sets `data-theme` before React
    // sees the document, so server markup and hydrated DOM disagree by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>{ERROR_TITLE}</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <main id="main" className="ds-container ds-container--full">
          <Stack gap={6}>
            <EmptyState
              message={ERROR_NOTE}
              action={<Button onClick={retry}>{ERROR_ACTION}</Button>}
            />
          </Stack>
        </main>
      </body>
    </html>
  );
}

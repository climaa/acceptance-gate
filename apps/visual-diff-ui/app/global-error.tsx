'use client';

import { Button, EmptyState, Stack } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * A throw in the root layout, which `app/error.tsx` renders inside and so
 * cannot catch. This one has a real way to get there: `SampleNotice` awaits
 * `resolveDataDir()`, which reads the filesystem.
 *
 * Replacing that layout is why the document, `globals.css` and `THEME_SCRIPT`
 * are restated below; `app/layout.tsx` explains each, and `app/error.tsx`
 * explains `retry` and the unread `error`.
 *
 * The script is this app's own, and that is the part worth knowing: unlike the
 * blog's, it never consults `prefers-color-scheme`, because a capture needs a
 * theme it chose rather than one the capture machine was set to. lib/theme.ts
 * argues both halves.
 *
 * `<title>` is an element because a `metadata` export is unsupported in a
 * Client Component. No `SiteHeader`: it belongs to the layout that just threw.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    // Disagreeing markup is the point — see app/layout.tsx.
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

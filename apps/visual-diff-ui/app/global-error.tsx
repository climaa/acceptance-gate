'use client';

import { useEffect } from 'react';

import { Button, EmptyState, Stack } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { applyStoredTheme } from '@/lib/theme';
import './globals.css';

/**
 * A throw in the root layout, which `app/error.tsx` renders inside and so
 * cannot catch. This one has a real way to get there: `SampleNotice` awaits
 * `resolveDataDir()`, which reads the filesystem.
 *
 * Replacing that layout is why the document and `globals.css` are restated
 * below; `app/layout.tsx` explains each, and `app/error.tsx` explains `retry`
 * and the unread `error`.
 *
 * The theme is NOT restated as the layout's inline script. React builds this
 * document rather than parsing it, and a `<script>` created that way never
 * runs — so a copy would be dead code, while the attribute the layout's copy
 * had set is discarded with the document it was set on. Measured: a reader with
 * `dark` stored was served the light palette on every root-layout error.
 * `applyStoredTheme` is the same rule applied on mount, and it is this app's
 * own rule: unlike the blog's it never consults `prefers-color-scheme`, because
 * a capture needs a theme it chose. lib/theme.ts argues both halves.
 *
 * `<title>` is an element because a `metadata` export is unsupported in a
 * Client Component. No `SiteHeader`: it belongs to the layout that just threw.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  useEffect(applyStoredTheme, []);

  return (
    <html lang="en">
      <head>
        <title>{ERROR_TITLE}</title>
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

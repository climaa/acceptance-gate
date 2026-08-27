'use client';

import { useEffect } from 'react';

import { BlogIndexTemplate, Button } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { applyStoredTheme } from '@/lib/theme';
import './globals.css';

/**
 * A throw in the root layout, which `app/error.tsx` renders inside and so
 * cannot catch.
 *
 * This file replaces that layout instead of rendering inside it, so the
 * document and `globals.css` are restated below; `app/layout.tsx` explains
 * each, and `app/error.tsx` explains `retry` and the unread `error`.
 *
 * The theme is NOT restated as the layout's inline script, and that is the one
 * thing here worth reading twice. React builds this document rather than
 * parsing it, and a `<script>` created that way never runs — so a copy of the
 * script would be dead code, while the attribute the layout's copy had already
 * set is discarded along with the document it was set on. Measured: a reader
 * with `dark` stored was served the light palette on every root-layout error.
 * `applyStoredTheme` is the same rule applied on mount, which costs one frame
 * and is the only moment React will let anything reach this `<html>`.
 *
 * What is only true here: `<title>` is an element because a `metadata` export
 * is unsupported in a Client Component, and an error boundary has to be one.
 * And no header or footer, because both belong to the layout that just threw.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  useEffect(applyStoredTheme, []);

  return (
    <html lang="en">
      <head>
        <title>{ERROR_TITLE}</title>
      </head>
      <body>
        <main id="main" className="ds-container">
          <BlogIndexTemplate
            title={ERROR_TITLE}
            posts={[]}
            empty={ERROR_NOTE}
            emptyAction={<Button onClick={retry}>{ERROR_ACTION}</Button>}
          />
        </main>
      </body>
    </html>
  );
}

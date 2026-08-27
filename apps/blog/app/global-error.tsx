'use client';

import { BlogIndexTemplate, Button } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * The boundary of last resort: a throw in the root layout itself, which
 * `app/error.tsx` sits inside and therefore cannot catch.
 *
 * This file REPLACES the root layout rather than rendering inside it, so
 * everything the layout would have supplied has to be restated here — the
 * document, the stylesheet, and the theme. That is why `globals.css` is
 * imported again and why `THEME_SCRIPT` runs again: without the script this
 * page would be the one surface in the site whose theme is decided by the
 * reader's OS rather than by the `[data-theme]` attribute the toggle writes,
 * which is the split CODING_STANDARDS exists to prevent.
 *
 * `<title>` as an element, not a `metadata` export: metadata is unsupported in
 * a Client Component, and an error boundary has to be one. React hoists it.
 *
 * No header and no footer. Both are the layout's, and a layout that just threw
 * is not something to re-run inside its own fallback.
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

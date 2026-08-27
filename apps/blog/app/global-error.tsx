'use client';

import { BlogIndexTemplate, Button } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';
import { THEME_SCRIPT } from '@/lib/theme';
import './globals.css';

/**
 * A throw in the root layout, which `app/error.tsx` renders inside and so
 * cannot catch.
 *
 * This file replaces that layout instead of rendering inside it, which is why
 * the document, `globals.css` and `THEME_SCRIPT` are all restated below.
 * `app/layout.tsx` is where each of those is explained, and `app/error.tsx` is
 * where `retry` and the unread `error` are — neither is repeated here.
 *
 * What is only true here: `<title>` is an element because a `metadata` export
 * is unsupported in a Client Component, and an error boundary has to be one.
 * And no header or footer, because both belong to the layout that just threw.
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

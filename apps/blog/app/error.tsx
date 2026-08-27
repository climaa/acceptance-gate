'use client';

import { BlogIndexTemplate, Button } from '@gate/ui';
import { ERROR_ACTION, ERROR_NOTE, ERROR_TITLE } from '@/lib/site';

/**
 * The boundary for everything under the root layout: a post whose frontmatter
 * parses but whose body throws, a highlighter that fails on one fence, a tag
 * page whose posts read wrong. Without this file each of those renders Next's
 * built-in error page, which carries none of this site's type, theme or footer.
 *
 * `retry`, not `reset` — Next 16 renamed the prop and re-fetches the segment's
 * data as well as re-rendering it, which is what a transient failure needs.
 * `reset` still exists and only clears the boundary's state; it is the wrong
 * one here, where every input is a file this build already read.
 *
 * `error` is deliberately not destructured. In production React replaces a
 * server error's message with a generic one and hands the real text to the
 * platform's logs under `error.digest`, so printing either here would show the
 * reader a string that either says nothing or belongs in a log.
 *
 * `BlogIndexTemplate` rather than a bare `EmptyState`, for the same reason
 * `app/not-found.tsx` uses it: it is what gives this page an `<h1>` without an
 * app inventing type styles of its own.
 */
export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <BlogIndexTemplate
      title={ERROR_TITLE}
      posts={[]}
      empty={ERROR_NOTE}
      emptyAction={<Button onClick={retry}>{ERROR_ACTION}</Button>}
    />
  );
}

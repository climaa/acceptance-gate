import { readFileSync } from 'node:fs';

import type { ManualSlug } from '@/lib/allowlist';

/**
 * The published `.feature` files, read as text.
 *
 * Every path here is a bare literal, and that is the whole design of this
 * module. Composing one — `path.join(repoRoot, page.featurePath)` — reads far
 * better and builds a measurably worse bundle: Turbopack cannot follow a
 * computed path, so it assumes the read might happen in a deployed function and
 * traces *the entire repository* into the output to be safe. It says so, as a
 * build warning, and the reason it cannot simply be ignored is that
 * `dynamicParams = false` — which would prove no request-time render exists — is
 * refused outright under `cacheComponents`.
 *
 * The two obvious ways to keep a computed path out of it both fail here:
 * `new URL(…, import.meta.url)` and `fileURLToPath` of one are rejected at
 * runtime, because the bundled realm's `URL` is not the class `node:fs` and
 * `node:url` accept. So these resolve against the working directory instead.
 * That is an assumption — `next build` and `vitest` both run with this workspace
 * as the working directory — but not a silent one: the reads happen at module
 * scope, so a wrong directory or a moved feature fails on import, during the
 * build and at the top of the test run, rather than on the page that needed it.
 *
 * The paths appear a second time in `lib/allowlist.ts`, where they are labels
 * for error messages rather than something opened. `sync.test.ts` asserts the
 * two lists cover the same pages; the strings themselves are prose, and a
 * mismatch would name the wrong file in an error rather than read the wrong one.
 */
export const FEATURE_SOURCES: Record<ManualSlug, string> = {
  console: readFileSync('../e2e/features/acceptance/visual-diff-console.feature', 'utf8'),
  report: readFileSync('../e2e/features/acceptance/visual-diff-report.feature', 'utf8'),
  sample: readFileSync('../e2e/features/acceptance/visual-diff-sample.feature', 'utf8'),
};

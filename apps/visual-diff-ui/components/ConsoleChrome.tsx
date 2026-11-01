import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Badge, SiteHeader, Text } from '@gate/ui';
import {
  APP_NAME,
  APP_TAGLINE,
  MANUAL_NAV,
  PROJECT_NAME,
  SAMPLE_LABEL,
  SAMPLE_NOTE,
} from '@/lib/site';

/**
 * What the root layout draws around every page, as presentational pieces.
 *
 * Here rather than inline in `app/layout.tsx` because a screen story draws the
 * same frame: the layout reads the data directory and so can never be imported
 * into Storybook, and a copy of its markup in the story would let the screen's
 * baseline photograph a header the console no longer has.
 */

/**
 * The brand line is the console's `h1`, after the name of the project it
 * serves: the board draws the wordmark and its tagline as the top row and gives
 * the page no second title, so a heading below it would be a title this design
 * does not have. `/report/[id]` inherits it
 * until the issue that owns that page gives the report its own heading level.
 */
export function Brand() {
  return (
    <span className="vd-brand">
      {/* The project, then the console: a breadcrumb read left to right. The
          project stays out of the `h1`, which names this page and not the
          repository serving it, and the slash is drawn, not read. */}
      <span className="vd-brand__wordmark">
        <Text variant="code" as="span" className="vd-brand__project">
          {PROJECT_NAME}
        </Text>
        <Text variant="code" as="span" className="vd-brand__project" aria-hidden="true">
          /
        </Text>
        {/* The display face's smallest heading role, at the page's one `h1`. */}
        <Text variant="heading-3" as="h1">
          {APP_NAME}
        </Text>
      </span>
      {/* A caption, not the brand's display face it would otherwise inherit. */}
      <Text variant="caption" className="vd-brand__tagline">
        {APP_TAGLINE}
      </Text>
    </span>
  );
}

/**
 * The badge every screen fed from `fixtures/` carries.
 *
 * `role="status"` with an explicit name: a live region takes its accessible
 * name from a label, not from its contents, and the note beside the badge is
 * the explanation rather than the name.
 */
export function SampleBanner() {
  return (
    <div className="vd-sample" role="status" aria-label={SAMPLE_LABEL}>
      <Badge tone="accent">{SAMPLE_LABEL}</Badge>
      <Text variant="body-sm" as="span" className="vd-sample__note">
        {SAMPLE_NOTE}
      </Text>
    </div>
  );
}

/**
 * The header and the `main` landmark every page sits in. `notice` goes first
 * inside `main`, where the layout puts the sample banner.
 *
 * `as={NextLink}` once, forwarded to the brand: the design system depends on no
 * framework, so this is where the app names its router link. The header supplies
 * the skip link and the theme toggle. The `main` id is SkipLink's default
 * target, and the landmark the header's first tab stop jumps to.
 */
export function ConsoleFrame({
  notice,
  children,
}: {
  notice: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader brand={<Brand />} nav={MANUAL_NAV} as={NextLink} container="full" />
      <main id="main" className="ds-container ds-container--full">
        {notice}
        {children}
      </main>
    </>
  );
}

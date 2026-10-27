import { Badge, Text } from '@gate/ui';
import { APP_NAME, APP_TAGLINE, SAMPLE_LABEL, SAMPLE_NOTE } from '@/lib/site';

/**
 * What the root layout draws around every page, as presentational pieces.
 *
 * Here rather than inline in `app/layout.tsx` because a screen story draws the
 * same frame: the layout reads the data directory and so can never be imported
 * into Storybook, and a copy of its markup in the story would let the screen's
 * baseline photograph a header the console no longer has.
 */

/**
 * The brand line is the console's `h1`: the board draws the wordmark and its
 * tagline as the top row and gives the page no second title, so a heading below
 * it would be a title this design does not have. `/report/[id]` inherits it
 * until the issue that owns that page gives the report its own heading level.
 */
export function Brand() {
  return (
    <span className="vd-brand">
      <h1 className="vd-brand__mark">{APP_NAME}</h1>
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
      <span className="vd-sample__note">{SAMPLE_NOTE}</span>
    </div>
  );
}

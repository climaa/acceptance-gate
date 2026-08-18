import { Badge, Stack } from '@gate/ui';
import {
  DEV_STORYBOOK,
  formatPixels,
  PUBLISHED_STORYBOOK,
  type ReportSides,
  ruleDocsLink,
  storybookLink,
} from '@/lib/report-view';
import type { Variant } from '@/lib/summary';

/**
 * One variant of one story: a viewport, a theme, and what the differ made of
 * the pair.
 *
 * The row is the evidence line. Its third element is where a pixel report puts
 * the diff image — and for an `a11y` variant that pane is replaced by the
 * violation list, because the pixels can be identical and a diff of two
 * identical shots says nothing about the failure. The shots themselves and the
 * three-up viewer are #283's; this row leaves that seam and renders the two
 * things a violation and an absent side need said in words.
 */

/** A variant passes only when nothing moved. Everything else — a diff, a
 *  missing side, a capture error, a violation — is a verdict a reviewer has to
 *  look at, and colouring them apart would rank failures against each other. */
const passes = (variant: Variant) => variant.bucket === 'unchanged';

/** Which side of the comparison a bucket says is absent, if either, named as
 *  `ReportSides` keys it — `added` had no baseline to compare against;
 *  `removed` has no candidate left. */
function absentSide(variant: Variant): keyof ReportSides | null {
  if (variant.bucket === 'added') return 'a';
  if (variant.bucket === 'removed') return 'b';

  return null;
}

/** The rule's own documentation and the story it fired on — the only two
 *  actions an accessibility failure has. There is no accept here by design. */
function ViolationList({ variant }: { variant: Variant }) {
  return (
    <ul className="vd-violations" aria-label="violations">
      {variant.violations.map((violation) => (
        <li key={violation.id} className="vd-violations__item">
          {/* Rule id and node count are the whole of what the differ records —
              `capture.mjs` maps axe's findings down to `{ id, nodes }`. The
              impact and the offending selector are not written, so they are not
              shown: a measurement this page invented would be worse than none. */}
          <code className="vd-mono">{violation.id}</code>{' '}
          <span className="vd-violations__nodes vd-mono">{violation.nodes} node(s)</span>{' '}
          <a
            className="vd-violations__docs"
            href={ruleDocsLink(violation.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            rule docs
          </a>
        </li>
      ))}
    </ul>
  );
}

export interface VariantRowProps {
  variant: Variant;
  /** The two capture-set labels the report compares, A then B. */
  sides: ReportSides;
}

export function VariantRow({ variant, sides }: VariantRowProps) {
  const pass = passes(variant);
  const absent = absentSide(variant);

  return (
    <div className="vd-variant">
      <Stack direction="row" gap={3} align="baseline" wrap>
        <Badge tone={pass ? 'success' : 'danger'}>{pass ? 'pass' : 'fail'}</Badge>

        <span className="vd-mono vd-variant__mode">
          {variant.viewport}/{variant.theme}
        </span>

        <span className="vd-variant__metric">
          <span className="vd-mono">{formatPixels(variant.overlapDiffPixels)} px</span>{' '}
          differ in the shared area
        </span>

        {/* Both Storybooks: the one a developer has running beside the console,
            and the published build the baselines were taken from. */}
        <a
          className="vd-variant__link"
          href={storybookLink(DEV_STORYBOOK, variant.id, variant.theme)}
          target="_blank"
          rel="noopener noreferrer"
        >
          dev Storybook
        </a>
        <a
          className="vd-variant__link"
          href={storybookLink(PUBLISHED_STORYBOOK, variant.id, variant.theme)}
          target="_blank"
          rel="noopener noreferrer"
        >
          baseline Storybook
        </a>
      </Stack>

      {absent && (
        <p className="vd-variant__absent">
          {absent.toUpperCase()} <span className="vd-mono">{sides[absent]}</span> — not on
          this side
        </p>
      )}

      {variant.error && <p className="vd-variant__error">{variant.error}</p>}

      {variant.bucket === 'a11y' && <ViolationList variant={variant} />}
    </div>
  );
}

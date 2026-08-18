import { Badge, Stack } from '@gate/ui';
import type { ComparisonMode } from '@/lib/comparison';
import {
  DEV_STORYBOOK,
  formatPixels,
  PUBLISHED_STORYBOOK,
  type ReportSides,
  ruleDocsLink,
  showsDevStorybook,
  storybookLink,
} from '@/lib/report-view';
import type { Variant } from '@/lib/summary';
import { ThreeUp } from './ThreeUp';

/**
 * One variant of one story: a viewport, a theme, and what the differ made of
 * the pair.
 *
 * The row is the evidence line, and under it the three-up viewer: baseline,
 * candidate, diff. For an `a11y` variant that viewer is replaced outright by
 * the violation list — the pixels can be identical and a diff of two identical
 * shots says nothing about a contrast ratio, so an accessibility card renders
 * no shot at all, and offers no way to accept one.
 */

/** A variant passes only when nothing moved. Everything else — a diff, a
 *  missing side, a capture error, a violation — is a verdict a reviewer has to
 *  look at, and colouring them apart would rank failures against each other. */
const passes = (variant: Variant) => variant.bucket === 'unchanged';

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
  reportId: string;
  variant: Variant;
  /** The two capture-set labels the report compares, A then B. */
  sides: ReportSides;
  onCompare: (variant: Variant, mode: ComparisonMode) => void;
}

export function VariantRow({ reportId, variant, sides, onCompare }: VariantRowProps) {
  const pass = passes(variant);

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
            and the published build the baselines were taken from. The first is
            offered only where it can answer — see `showsDevStorybook`. */}
        {showsDevStorybook() && (
          <a
            className="vd-variant__link"
            href={storybookLink(DEV_STORYBOOK, variant.id, variant.theme)}
            target="_blank"
            rel="noopener noreferrer"
          >
            dev Storybook
          </a>
        )}
        <a
          className="vd-variant__link"
          href={storybookLink(PUBLISHED_STORYBOOK, variant.id, variant.theme)}
          target="_blank"
          rel="noopener noreferrer"
        >
          baseline Storybook
        </a>
      </Stack>

      {variant.error && <p className="vd-variant__error">{variant.error}</p>}

      {variant.bucket === 'a11y' ? (
        <ViolationList variant={variant} />
      ) : (
        <ThreeUp
          reportId={reportId}
          variant={variant}
          sides={sides}
          onCompare={onCompare}
        />
      )}
    </div>
  );
}

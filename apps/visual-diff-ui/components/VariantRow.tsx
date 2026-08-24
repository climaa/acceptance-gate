import { Badge, type BadgeTone, Stack } from '@gate/ui';
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
import { compared } from '@/lib/shots';
import type { Bucket, Variant } from '@/lib/summary';
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

/**
 * The row's verdict, in the producer's own word.
 *
 * This badge used to read `pass`/`fail`, from `bucket === 'unchanged'`. Two
 * things were wrong with that. `artifacts.mjs` drops every `unchanged` row
 * before it writes `summary.json` and keeps only its count, so the `pass` branch
 * could never render and the badge was the constant `fail` on every row of every
 * report. And `fail` is the wrong word for half of what it covered: `compare.mjs`
 * is explicit that `added` and `removed` are a corpus that moved and needs a
 * deliberate accept, while `errored` and `a11y` are defects. A story that is
 * simply new has not failed anything.
 *
 * So the row says which of the six it is, and the reviewer reads the same word
 * here, on the card's chip above it, and on the bucket chip they filtered by.
 *
 * The tones mirror `BUCKET_TONES`, so the row and the chip above it are never
 * the same word in two colours. `BadgeTone` has no member named `a11y`, but the
 * name is not the point: `BucketChip`'s exclusive `a11y` tone paints
 * `--color-warning-*`, and `Badge`'s `warning` paints the same two tokens, so
 * `a11y` matches its chip exactly rather than being ranked against it here.
 * `muted` is the one tone with no `Badge` equivalent, and it belongs to a bucket
 * that cannot render — see below.
 *
 * (The earlier comment argued that colouring these apart would rank failures
 * against each other. That held while the word was binary and the colour was the
 * only signal. The word now carries the distinction, and the chip row already
 * ranks these same buckets by tone.)
 */
const BADGE_TONES: Record<Bucket, BadgeTone> = {
  changed: 'accent',
  added: 'accent',
  removed: 'danger',
  errored: 'danger',
  // `warning`, not `danger`: the same tokens the chip's `a11y` tone paints.
  a11y: 'warning',
  // Unreachable — see above. `muted` has no `Badge` equivalent, so `neutral`.
  unchanged: 'neutral',
};

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
  return (
    <div className="vd-variant">
      <Stack direction="row" gap={3} align="baseline" wrap>
        <Badge tone={BADGE_TONES[variant.bucket]}>{variant.bucket}</Badge>

        <span className="vd-mono vd-variant__mode">
          {variant.viewport}/{variant.theme}
        </span>

        {/* Only where two shots were actually put against each other. Where they
            were not, the three frames below say why in words — repeating it here
            as a pixel count of zero would be the same sentence told wrong. */}
        {compared(variant.bucket) && (
          <span className="vd-variant__metric">
            <span className="vd-mono">{formatPixels(variant.overlapDiffPixels)} px</span>{' '}
            differ in the shared area
          </span>
        )}

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

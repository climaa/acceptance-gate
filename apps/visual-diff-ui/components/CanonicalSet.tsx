import { Badge, Button, Stack } from '@gate/ui';
import { Note } from './Note';
import type { CanonicalSet as Corpus } from '@/lib/baselines';
import { formatBytes } from '@/lib/outcome';

/**
 * The committed baseline corpus, above the sets this instance captured.
 *
 * Above and outside the table on purpose. The table's own empty state says "this
 * instance has captured nothing yet", and the corpus is precisely a thing it did
 * not capture: CI accepted it, a commit changed it, and every pull request is
 * compared against it. Putting it in the same rows would make the count in
 * `SCREENSHOT SETS (n)` mean two different things at once.
 *
 * What it is for is the compare pickers, which do list it: a reviewer who has
 * just captured wants to know how their shots differ from the corpus, not from
 * yesterday's capture.
 *
 * `delete` is present and disabled rather than absent. The console can never
 * remove this — `DELETE /api/sets/baselines` refuses with the reason — and the
 * capture sets below all carry the button, so a row without one would read as an
 * omission instead of as a rule.
 */

/** What `git rev-parse --short` gives by default, and what `SetsTable` draws. */
const SHORT_SHA = 7;

/** What git could not say. The same dash the sets table uses for a size it has
 *  no measurement for, and for the same reason: blank reads as forgotten. */
const UNKNOWN = '—';

export interface CanonicalSetProps {
  corpus: Corpus;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" gap={2} align="center">
      <span className="vd-field__label">{label}</span>
      <span className="vd-mono">{value}</span>
    </Stack>
  );
}

export function CanonicalSet({ corpus }: CanonicalSetProps) {
  return (
    <Stack gap={2} className="vd-canonical">
      <Stack direction="row" gap={3} align="center" wrap>
        <span className="vd-set__label">{corpus.label}</span>
        <Badge tone="success">canonical</Badge>
      </Stack>

      <Stack direction="row" gap={4} align="center" wrap className="vd-canonical__facts">
        {/* The accepting commit, which is the only provenance a committed corpus
            has. No branch: a commit does not record the one it was made on, and
            naming the branch currently checked out would credit the corpus to
            whoever happens to be looking at it. */}
        <Field
          label="accepted"
          value={corpus.sha ? corpus.sha.slice(0, SHORT_SHA) : UNKNOWN}
        />
        <Field label="date" value={corpus.acceptedAt ?? UNKNOWN} />
        <Field label="stories" value={String(corpus.stories)} />
        <Field label="size" value={formatBytes(corpus.bytes)} />
      </Stack>

      <Stack direction="row" gap={3} align="center" wrap>
        <Note name="canonical corpus">
          what CI compares every pull request against — compare a capture with this to see
          what a change did to the corpus
        </Note>
        <Button variant="danger" size="sm" disabled>
          delete
        </Button>
      </Stack>
    </Stack>
  );
}

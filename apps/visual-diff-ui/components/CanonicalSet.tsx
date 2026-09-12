import NextLink from 'next/link';
import { Badge, Button, Stack } from '@gate/ui';
import { Field } from './Field';
import { Note } from './Note';
import type { CanonicalSet as Corpus } from '@/lib/baselines';
import { UNKNOWN, formatBytes, shortSha } from '@/lib/outcome';
import { setHref } from '@/lib/shots';

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

export interface CanonicalSetProps {
  corpus: Corpus;
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
        <Field label="accepted" value={shortSha(corpus.sha)} />
        <Field label="date" value={corpus.acceptedAt ?? UNKNOWN} />
        <Field label="stories" value={String(corpus.stories)} />
        <Field label="size" value={formatBytes(corpus.bytes)} />
      </Stack>

      <Stack direction="row" gap={3} align="center" wrap>
        <Note name="canonical corpus">
          what CI compares every pull request against — compare a capture with this to see
          what a change did to the corpus
        </Note>
        {/* The corpus is the one set that is always here to be read: the card is
            drawn only when `readCanonicalSet` found one, so this link can never
            be the dead one the sets table guards against. */}
        <NextLink className="vd-set__open" href={setHref(corpus.label)}>
          browse screenshots →
        </NextLink>
        <Button variant="danger" size="sm" disabled>
          delete
        </Button>
      </Stack>
    </Stack>
  );
}

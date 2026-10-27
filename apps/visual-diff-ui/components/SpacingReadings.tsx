import { useId, useState } from 'react';
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Stack,
  Table,
  type TableColumn,
  type TableRow,
  Text,
} from '@gate/ui';
import type { Classification } from '@gate/visual-diff/ledger';
import type { ReadingRow, ReadingSide, Readings, ReadingsMode } from '@/lib/readings';

/**
 * What the spacing did, in design-token terms — the part of the design view a
 * designer reads rather than looks at.
 *
 * Reference beside a comparison, exactly as the board is: a reading names a
 * value, it never judges one. That is why no row carries `danger` or `success`,
 * and why "off-scale" is drawn in the warning tone and nothing stronger — the
 * differ detects change, not correctness.
 *
 * App-local, and a composition of `@gate/ui` parts with no control of its own:
 * the pressed row is a `Button`, and what that press MEANS — the box outlined
 * on the after screenshot — belongs to `DesignStage`, which owns both panes.
 * Which row is pressed therefore arrives as a prop.
 *
 * Nothing here reads a file. The report is read on the server
 * (lib/ledger.ts) and threaded down as a prop, so the panel works the same on
 * the intercepted modal and on a cold load, with no second fetch.
 */

/** The panel's name, and the table's: one heading, one accessible name. */
const HEADING = 'Spacing readings';

/** What the panel is able to say, which is decided by how many sides the
 *  readings had. `after-only` is every compare against `baselines` — the corpus
 *  is committed rather than captured, so it carries no ledgers at all — and
 *  `every` is one screenshot opened from a set, read as it stands. */
type Mode = ReadingsMode;

const CAPTIONS: Readonly<Record<Mode, string>> = {
  changed: 'changed between before and after',
  'after-only': 'after side · off-scale only',
  every: 'every reading in this screenshot',
};

const NOTHING_FOUND: Readonly<Record<Mode, string>> = {
  changed: 'No spacing changed between before and after.',
  'after-only': 'No off-scale spacing in the after screenshot.',
  every: 'No spacing measured in this screenshot.',
};

/** What the panel is beside, which is the one word its missing-ledger sentence
 *  changes on. */
export type ReadingsSubject = 'comparison' | 'screenshot';

/** A comparison with no sidecar to read, and one whose after capture measured
 *  nothing, say the same thing: there is no ledger behind this panel. A set's
 *  screenshot says where one would come from, because a reader holding a
 *  baselines shot has no other way to learn that the console can make one. */
const NO_LEDGER: Readonly<Record<ReadingsSubject, string>> = {
  comparison: 'No token ledger for this comparison.',
  screenshot:
    'No token ledger for this screenshot. Capture a set from the console to read its spacing.',
};

/** A side that is not there: an element that arrived has no before, one that
 *  left has no after. The same em dash the history table uses for a number a
 *  run never wrote. */
const NOTHING = '—';

/** What the origin `user-agent` means, said in words rather than left as a
 *  value nobody outside the capture would recognise. */
const USER_AGENT = 'browser default';

/**
 * The px one step of the spacing scale is worth.
 *
 * The report names the step a value is nearest (`--space-4`) and carries no
 * scale — `serializeLedgerReport` writes none — but a step's name IS its value
 * on this scale: `--space-1` is `0.25rem`, 4 px at the root size every capture
 * runs at, and `packages/ui/src/tokens.css` is where that holds. So the signed
 * difference below is read off the name, which is the only thing a report has.
 */
const STEP_PX = 4;

/** The report writes its pixel values at two decimals, so a difference is read
 *  back at the same precision: 16.5 against `--space-4` is +0.5, not a float
 *  tail. */
const DECIMALS = 2;

/** The step a token name is worth, or null for a name that is not a step of the
 *  spacing scale. */
function stepPx(token: string): number | null {
  const digits = /^--space-(\d+(?:\.\d+)?)$/.exec(token)?.[1];

  return digits === undefined ? null : Number(digits) * STEP_PX;
}

/** A value's distance from its nearest step, signed. The minus is U+2212, the
 *  one the zoom controls are drawn with — a hyphen reads as a hyphen at this
 *  size. */
function signed(distance: number): string {
  const rounded = Math.round(distance * 10 ** DECIMALS) / 10 ** DECIMALS;

  return rounded < 0 ? `−${Math.abs(rounded)}` : `+${rounded}`;
}

const pixels = (px: number) => `${px}px`;

/** A value named through the design token that set it — the one term the before
 *  column and the token column both write. */
const tokenTerm = (token: string, px: number) => `${token} (${pixels(px)})`;

/** One side's value as the panel writes it: in token terms where a token set
 *  it, and in pixels otherwise. */
function sideTerm(side: ReadingSide | null): string {
  if (side === null) return NOTHING;
  if (side.classification === 'token' && side.token !== null) {
    return tokenTerm(side.token, side.px);
  }

  return pixels(side.px);
}

/** A reading describes rather than judges, so the strongest tone here is
 *  `warning` — the two classifications that say a value is not the design token
 *  it could be — and `danger` and `success` are both absent on purpose. */
const TONES: Readonly<Record<Classification, BadgeTone>> = {
  token: 'neutral',
  'raw-on-scale': 'warning',
  'off-scale': 'warning',
  exempt: 'neutral',
  none: 'neutral',
};

/** What a classification says about the value beside it, or null where the
 *  badge has already said all there is.
 *
 *  `exempt` quotes its reason where the reading carries one — a screenshot's
 *  own sidecar does. A paired report's `ChangeSide` does not, so there the
 *  panel names the exemption without quoting it. */
function classificationTerm(side: ReadingSide): string | null {
  const { classification, token, px } = side;
  if (classification === 'exempt') return side.reason ?? null;
  if (token === null) return null;

  if (classification === 'token') return tokenTerm(token, px);
  // The one place "should be" is honest: the value IS the step, written as a
  // literal rather than read through the step's own custom property.
  if (classification === 'raw-on-scale') return `should be ${token}`;
  if (classification !== 'off-scale') return null;

  const step = stepPx(token);

  return step === null ? `nearest ${token}` : `nearest ${token} (${signed(px - step)})`;
}

/** The after value, with what wrote it when that is worth saying. */
function AfterCell({ side }: { side: ReadingSide | null }) {
  if (side === null) return NOTHING;

  return (
    <Stack direction="row" gap={2} align="baseline" wrap>
      <span>{pixels(side.px)}</span>
      {side.origin === 'user-agent' && (
        <span className="vd-readings__note">{USER_AGENT}</span>
      )}
    </Stack>
  );
}

/** How the after value is named against the scale. An element that arrived or
 *  left is named as that instead: there is no pair of values to classify. */
function TokenCell({ change }: { change: ReadingRow }) {
  if (change.change === 'appeared' || change.change === 'gone') {
    return <Badge tone="accent">{change.change}</Badge>;
  }
  if (change.after === null) return null;

  const term = classificationTerm(change.after);

  return (
    <Stack direction="row" gap={2} align="baseline" wrap>
      <Badge tone={TONES[change.after.classification]}>
        {change.after.classification}
      </Badge>
      {term !== null && <span>{term}</span>}
    </Stack>
  );
}

/** Sized to what they hold, in the proportions x-visual-diff-pages draws: the element
 *  column carries a control, and `table-layout: fixed` will not grow a cell for
 *  its contents. The design-token column takes whatever is left. One screenshot
 *  has no after to set against a before, so its value is just the value. */
const columnsFor = (mode: Mode): readonly TableColumn[] => [
  { header: 'element', width: '18rem' },
  { header: 'property', width: '9rem' },
  ...(mode === 'changed' ? [{ header: 'before', width: '11rem' }] : []),
  { header: mode === 'every' ? 'value' : 'after', width: '13rem' },
  { header: 'design token' },
];

interface RowInput {
  change: ReadingRow;
  /** The change's position in the report, which is the row's whole identity:
   *  a label is not one — two elements can answer to the same name — and the
   *  list is never re-sorted. */
  index: number;
  mode: Mode;
  pressed: number | null;
  onPress: (index: number | null) => void;
  onHover: (index: number | null) => void;
}

function readingRow({
  change,
  index,
  mode,
  pressed,
  onPress,
  onHover,
}: RowInput): TableRow {
  const on = pressed === index;

  return {
    key: String(index),
    cells: [
      <Button
        key="element"
        variant="ghost"
        size="sm"
        className="vd-readings__element"
        aria-pressed={on}
        // The accessibility tree's own name for the element, which is also what
        // the pairing matched on — so a reader recognises the row from the shot.
        title={change.label}
        onClick={() => onPress(on ? null : index)}
        // Hover previews what pressing would hold: the box lights up while the
        // pointer is on the row, and lets go when it leaves. Focus does the same
        // for a reader tabbing down the rows.
        onMouseEnter={() => onHover(index)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(index)}
        onBlur={() => onHover(null)}
      >
        <span className="vd-readings__label">{change.label}</span>
      </Button>,
      change.property,
      ...(mode === 'changed' ? [sideTerm(change.before)] : []),
      <AfterCell key="after" side={change.after} />,
      <TokenCell key="token" change={change} />,
    ],
  };
}

/** The one line a folded panel reads: how many readings there are, and whether
 *  any of them is worth unfolding for. Counted, never judged — "off-scale" and
 *  "raw on the scale" are what the badges say, in the badges' own words. */
function foldSummary(rows: readonly ReadingRow[]): string {
  const count = (classification: Classification) =>
    rows.filter((row) => row.after?.classification === classification).length;
  const notable = [
    [count('off-scale'), 'off-scale'],
    [count('raw-on-scale'), 'raw on the scale'],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, what]) => `${n} ${what}`);
  const noun = rows.length === 1 ? 'reading' : 'readings';

  return [
    `${rows.length} ${noun}`,
    notable.length === 0 ? 'all on the scale or exempt' : notable.join(' · '),
  ].join(' · ');
}

export interface SpacingReadingsProps {
  /** What the spacing did, or measured, on this variant — or null where there
   *  is no ledger behind the panel. */
  ledger: Readings | null;
  /** Which row is pressed, as its index in the readings. */
  pressed: number | null;
  onPress: (index: number | null) => void;
  /** The same emphasis, for as long as a pointer or focus is on a row. */
  onHover: (index: number | null) => void;
  /** Whether the panel opens folded to one line, or null for a panel that does
   *  not fold. A set's screenshot folds, because there the weight is the
   *  pixels; a comparison's readings are what its design view is FOR. */
  folded?: boolean | null;
  subject?: ReadingsSubject;
}

export function SpacingReadings({
  ledger,
  pressed,
  onPress,
  onHover,
  folded = null,
  subject = 'comparison',
}: SpacingReadingsProps) {
  const mode = ledger?.mode ?? null;
  const rows = ledger?.rows ?? [];
  const tableId = useId();
  // Held, not derived from the address: unfolding is a way of looking, like the
  // modal's split and grid. Next keeps a closed modal mounted but hidden, so
  // reopening the SAME screenshot finds it as the reader left it — and another
  // screenshot is another route instance, which starts folded.
  const [closed, setClosed] = useState(folded === true);
  // Only something to unfold: a missing ledger is one sentence, and an empty
  // one is another, so neither is ever hidden behind a press.
  const foldable = folded !== null && mode !== null && rows.length > 0;
  const shut = foldable && closed;

  return (
    <div className="vd-readings">
      <Stack direction="row" gap={3} align="baseline" wrap>
        <Text variant="title">
          {/* x-visual-diff-pages' fold marker. Decoration: the button below carries the
              state, as aria-expanded. */}
          {foldable && (
            <span className="vd-readings__chevron" aria-hidden="true">
              {shut ? '▸' : '▾'}
            </span>
          )}
          {HEADING}
        </Text>
        {mode !== null && (
          <p className="vd-readings__caption vd-mono">
            {shut ? foldSummary(rows) : CAPTIONS[mode]}
          </p>
        )}
        {foldable && (
          <Button
            variant="ghost"
            size="sm"
            className="vd-readings__fold"
            aria-expanded={!shut}
            aria-controls={tableId}
            onClick={() => setClosed(!shut)}
          >
            {shut ? 'show' : 'hide'}
          </Button>
        )}
      </Stack>

      {mode === null || rows.length === 0 ? (
        <EmptyState message={mode === null ? NO_LEDGER[subject] : NOTHING_FOUND[mode]} />
      ) : (
        <div id={tableId} hidden={shut}>
          <Table
            label={HEADING}
            className="vd-readings__table"
            columns={columnsFor(mode)}
            rows={rows.map((change, index) =>
              readingRow({ change, index, mode, pressed, onPress, onHover }),
            )}
          />
        </div>
      )}
    </div>
  );
}

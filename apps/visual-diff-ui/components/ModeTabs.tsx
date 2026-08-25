'use client';

import type { KeyboardEvent } from 'react';

/**
 * The job-mode strip: which jobs this console can start, and the tablist that
 * picks between them.
 *
 * Lifted out of RunPanel, which was 850 lines holding four jobs at once — the
 * mode vocabulary, the form state it derives from the URL, three reads of three
 * endpoints, and the start action. This is the one of the four that knows nothing
 * about any of the others: give it a mode and a callback and it is a tablist.
 *
 * APP-LOCAL, not `packages/ui`, and that is a decision rather than an oversight.
 * A roving tablist is a generic control and the design system is where generic
 * controls belong — but a story there enters the capture matrix, which is two
 * baselines per variant, and the tab labels here ARE the job modes. Moving it
 * would mean either a component that renders `capture`/`compare` inside a design
 * system that must not know what a job is, or a generic `Tabs` designed on the
 * board first. The second is the right shape and it is a design task, not this
 * one.
 */

const PANEL_ID = 'vd-run-fields';

const tabId = (mode: Mode) => `vd-tab-${mode}`;

/**
 * Two, and exactly the two the runner has.
 *
 * There were four. `run` sat between `compare` and `accept` and did what
 * `capture` does — `runCheck` takes the mode and has never read it — so the
 * strip offered a choice with one outcome, and the filter note under both tabs
 * said the same sentence because it was describing the same job. `accept` went
 * for a different reason: it wrote a corpus nothing reads (see the header).
 */
const MODES = ['capture', 'compare'] as const;

type Mode = (typeof MODES)[number];

const isMode = (value: string | null): value is Mode =>
  MODES.some((mode) => mode === value);

export type { Mode };
export { PANEL_ID, isMode, tabId };

const step = (from: Mode, by: number) =>
  MODES[(MODES.indexOf(from) + by + MODES.length) % MODES.length] as Mode;

/** Which mode a key moves to from the one selected, or nothing for a key the
 *  tablist does not own. Wrapping, both axes: the strip reads as a row and stacks
 *  to a column below 768 px. */
const KEYS: Record<string, (from: Mode) => Mode> = {
  ArrowRight: (from) => step(from, 1),
  ArrowDown: (from) => step(from, 1),
  ArrowLeft: (from) => step(from, -1),
  ArrowUp: (from) => step(from, -1),
  Home: () => MODES[0],
  End: () => MODES[MODES.length - 1] as Mode,
};

/** The mode tabs. One tab stop for the three of them, arrows between: a tablist
 *  where every tab is tabbable puts three stops in front of the fields. */
export function ModeTabs({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (mode: Mode) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = KEYS[event.key]?.(mode);
    if (!next) return;

    onSelect(next);
    // Focus follows the selection, because the roving `tabIndex` below is about
    // to make the tab under it untabbable: leaving focus there would send the
    // next Tab out of the tablist from a stop that no longer exists.
    event.currentTarget.querySelector<HTMLButtonElement>(`#${tabId(next)}`)?.focus();
    event.preventDefault();
  };

  return (
    <div role="tablist" aria-label="job mode" className="vd-tabs" onKeyDown={onKeyDown}>
      {MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          role="tab"
          id={tabId(candidate)}
          aria-controls={PANEL_ID}
          aria-selected={candidate === mode}
          tabIndex={candidate === mode ? 0 : -1}
          className={`vd-tab${candidate === mode ? ' vd-tab--selected' : ''}`}
          onClick={() => onSelect(candidate)}
        >
          {candidate}
        </button>
      ))}
    </div>
  );
}

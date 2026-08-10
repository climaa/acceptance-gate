// @ts-check
//
// The pure half of the capture contract. Every rule below is a string, an object or a
// pure function, so the whole determinism policy is unit-testable with no browser
// anywhere near it. `capture.mjs` (Wave 4) is the only module that imports `playwright`;
// it consumes this one and adds nothing to it.
//
// Literals that belong to the run — the RNG seed, the shot interval, the launch args —
// live in `policy.mjs` and are imported, never restated.

import { DETERMINISM } from './policy.mjs';

/** The instant every clock inside a captured page reports.
 *
 *  Noon rather than midnight: at midnight UTC the local calendar date differs from the
 *  UTC one across most negative offsets, so a component printing a local date would
 *  render a different day depending on where the capture ran. */
export const PINNED_NOW_ISO = '2026-01-01T12:00:00.000Z';

/** The source injected via `addInitScript` on the browser context, **before `goto`** —
 *  after navigation the page has already read the clock it was going to read.
 *
 *  @returns {string} */
export function buildInitScript() {
  return `(() => {
  const FIXED_MS = Date.parse(${JSON.stringify(PINNED_NOW_ISO)});

  // A subclass, not a replacement. PinnedDate inherits Date.parse and Date.UTC, so
  // date formatting inside a component keeps working; swapping Date out wholesale
  // breaks that formatting and the failure surfaces as a component bug, several
  // layers away from the capture layer that actually caused it.
  class PinnedDate extends Date {
    constructor(...args) {
      if (args.length === 0) {
        super(FIXED_MS);
        return;
      }
      super(...args);
    }

    static now() {
      return FIXED_MS;
    }
  }

  globalThis.Date = PinnedDate;
  globalThis.performance.now = () => 0;

  // mulberry32, seeded from policy's rngSeed: a component that draws a random value
  // draws the same one on every machine and in every run.
  let state = ${DETERMINISM.rngSeed} | 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();`;
}

/** Injected into the page before the shot.
 *
 *  `scroll-behavior` and the scrollbar rule are not cosmetic. Linux Chromium renders a
 *  classic scrollbar that consumes layout width where macOS renders an overlay one, so
 *  without them every baseline shifts by the scrollbar width between a laptop and CI —
 *  a whole-matrix diff with no UI change behind it. A smooth scroll is the same problem
 *  in time rather than space: the shot lands mid-animation. */
export const FREEZE_CSS = `*,
*::before,
*::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}

::-webkit-scrollbar {
  display: none;
}
`;

/** The render phases that mean "this story is done".
 *
 *  All three, never `completed` alone. Storybook reports the terminal phase under
 *  different names across versions and across whether the story has a `play` function,
 *  so gating on one of them is a race the poller always loses: every story sits pending
 *  until the timeout, and the run surfaces it as a misleading server error rather than
 *  as the phase mismatch it is.
 *  @type {readonly string[]} */
export const RENDERED_PHASES = Object.freeze(['finished', 'completed', 'played']);

/** Whether a phase reported by the preview means the story has finished rendering.
 *  @param {unknown} phase
 *  @returns {boolean} */
export function isRenderedPhase(phase) {
  return RENDERED_PHASES.includes(/** @type {string} */ (phase));
}

/** The predicate evaluated in-page — `page.waitForFunction`'s argument — deciding that
 *  the story under capture has finished rendering. Built from {@link RENDERED_PHASES}
 *  so the accepted set is stated once.
 *
 *  `every`, guarded by a length check: an empty `storyRenders` is a preview that has not
 *  started yet, which is pending, not done. */
export const RENDER_PHASE_EXPRESSION = `(() => {
  const renders = globalThis.__STORYBOOK_PREVIEW__?.storyRenders ?? [];
  const done = ${JSON.stringify([...RENDERED_PHASES])};
  return renders.length > 0 && renders.every((render) => done.includes(render.phase));
})()`;

/** Byte equality for two screenshots — the comparison behind the stable-shot loop, which
 *  reshoots until two consecutive shots match before it trusts either.
 *  @param {Uint8Array} a
 *  @param {Uint8Array} b
 *  @returns {boolean} */
export function shotsEqual(a, b) {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }

  return true;
}

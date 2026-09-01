/**
 * Everything the changelog control needs the `.lottie` to contain.
 *
 * These names are not the component's to choose — they are the Creator file's,
 * and the component only borrows them. Collected here rather than written as
 * bare literals wherever they are used, because they are the one contract in
 * this feature that NOTHING would otherwise notice breaking.
 *
 * Every call that crosses this boundary swallows its own failure signal:
 * `stateMachineLoad`, `stateMachineStart`, `setTheme` and
 * `stateMachineOverrideState` all return a boolean nobody reads, and
 * `stateMachineFireEvent` returns nothing at all. The acceptance suite
 * deliberately never asserts on the icon — that is visual-diff's job — so a
 * re-export that renamed a state would kill the animation outright with every
 * check in the repo still green.
 *
 * `__tests__/changelog-sync-asset.test.ts` reads the shipped archive and
 * asserts it provides all of this, which is what turns the contract from an
 * assumption into something the gate can fail on. Re-exporting the asset is
 * already an open item, so this is the drift most likely to actually happen.
 */

/** Served from `public/`, never a CDN on a page's critical path. */
export const LOTTIE_SRC = '/lottie/changelog-sync.lottie';

/** Where that file lives in the repo, for the test that reads it. */
export const LOTTIE_FILE = 'public/lottie/changelog-sync.lottie';

/** The state machine inside the file — see the manifest's `stateMachines`. */
export const STATE_MACHINE = 'changelog-sync';

/** The two themes the file carries, one per `[data-theme]` value. */
export const THEMES = { light: 'gate-light', dark: 'gate-dark' } as const;

/**
 * The states the control drives the machine into, one per thread status.
 *
 * The keys are this app's vocabulary and the values are the file's. Anything
 * that needs the mapping imports it; nothing re-types it.
 */
export const STATE_FOR_STATUS = {
  idle: 's-idle',
  loading: 's-syncing',
  ready: 's-synced',
  failed: 's-failed',
} as const;

/**
 * The inputs the control fires.
 *
 * `pointerEnter`/`pointerExit` are fired from the button rather than left to the
 * file's own pointer interactions — see `LottieBlock`, where the canvas is made
 * inert so a press cannot reach the machine behind the component's back.
 */
export const EVENTS = {
  pointerEnter: 'pointerEnter',
  pointerExit: 'pointerExit',
  click: 'click',
  syncOk: 'syncOk',
  syncFailed: 'syncFailed',
} as const;

/**
 * The state the machine has that the control never names.
 *
 * Hover is reached by TRANSITION — the machine's own edge out of `s-idle` on
 * `pointerEnter` — and never by `stateMachineOverrideState`, because an
 * override is a jump and hover is something the reader is in the middle of
 * doing. It is declared here anyway so the asset check can pin the machine's
 * whole state set rather than only the part this file drives: a re-export that
 * renamed a state the control does not use would still break hover, and
 * asserting a subset would not notice.
 */
export const UNDRIVEN_STATES = ['s-hover'] as const;

/** Every state the machine declares — the four the control drives, plus hover. */
export const ALL_STATES = [...Object.values(STATE_FOR_STATUS), ...UNDRIVEN_STATES];

/**
 * Where the artwork actually sits inside the 512 artboard, in artboard units.
 *
 * It does not fill it: the drawing occupies 304 x 320 of 512 x 512 — about 38%
 * by area — and its centre is 4 right and 14 below the artboard's. Left alone,
 * three fifths of the icon box is margin baked into the file, which is why the
 * control read as small at any size.
 *
 * MEASURED, not read off the file. A bounding box is the union of every drawn
 * layer after its own transform, and the pencil is a precomposition with nine
 * layers inside it — arithmetic worth doing once against the pixels the renderer
 * actually paints rather than reimplementing. Re-measure after a re-export that
 * moves the composition: render the icon, read back the canvas, and take the
 * bounds of everything above alpha 8.
 */
export const ARTWORK = {
  width: 304,
  height: 320,
  centreX: 260,
  centreY: 270,
} as const;

/** The artboard the numbers above are expressed in. */
export const ARTBOARD = 512;

/**
 * How much of that margin is cropped away.
 *
 * 1.60 is where the taller side would touch an edge, so this leaves a little
 * air. Applied in CSS to the icon box's children — both of them — so the
 * animation and the reduced-motion still are framed identically and nothing
 * shifts when a reader turns that preference on.
 */
export const ZOOM = 1.5;

/**
 * The transform that crops the margin, as CSS custom properties.
 *
 * The translate re-centres the artwork on the box: its centre is off the
 * artboard's by `ARTWORK.centre - ARTBOARD / 2`, and scaling about the box
 * centre multiplies that offset by the zoom. Expressed as a percentage because
 * a percentage in `translate` resolves against the element's own size, which is
 * the box — so one set of values is correct at every icon size.
 */
export function zoomVariables(): Record<string, string> {
  const shift = (centre: number) =>
    `${(-ZOOM * ((centre - ARTBOARD / 2) / ARTBOARD) * 100).toFixed(3)}%`;

  return {
    '--changelog-sync-zoom': String(ZOOM),
    '--changelog-sync-nudge-x': shift(ARTWORK.centreX),
    '--changelog-sync-nudge-y': shift(ARTWORK.centreY),
  };
}

/** One thread's state, as this app names it. */
export type ThreadStatus = keyof typeof STATE_FOR_STATUS;

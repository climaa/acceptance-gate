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
 * Where the artwork sits inside the 512 artboard, in artboard units.
 *
 * It does not fill it. At rest the drawing occupies 304 x 320 of 512 x 512 and
 * its centre sits 4 right and 14 below the artboard's, so left alone most of the
 * icon box is margin baked into the file.
 *
 * TWO extents, and the difference is the whole reason this is written down. The
 * resting one is what the eye judges and what the crop is centred on. The moving
 * one is the union across all 180 frames, and it is bigger — the pencil travels
 * during the syncing segment, reaching 321 x 354 around frames 58 to 62. A crop
 * sized from the resting frame alone fits until the animation plays and then
 * clips it, which is exactly what happened at zoom 1.5: within the resting
 * frame's limit of 1.60, past the moving one.
 *
 * MEASURED, not read off the file. A bounding box is the union of every drawn
 * layer after its own transform AT A GIVEN FRAME, and the pencil is a
 * precomposition of nine layers — arithmetic worth doing once against the pixels
 * the renderer actually paints. Re-measure after a re-export that moves the
 * composition: stop the state machine, step `setFrame` across the whole
 * timeline, and take the union of everything above alpha 8.
 */
export const ARTWORK = {
  /** The resting frame, and the centre the crop aligns on. */
  restWidth: 304,
  restHeight: 320,
  centreX: 260,
  centreY: 270,
  /** The widest and tallest the animation ever gets, across every frame. */
  motionWidth: 321,
  motionHeight: 354,
} as const;

/** The artboard the numbers above are expressed in. */
export const ARTBOARD = 512;

/**
 * How much of that margin is cropped away.
 *
 * Bounded by the MOVING extent, not the resting one. Scaling about the resting
 * centre, the first edge the animation reaches is the bottom — 270 + z * (439 -
 * 270) has to stay inside 512 — which caps this at 1.43. `zoomStaysInside`
 * checks all four edges and `__tests__/changelog-sync-zoom.test.ts` fails if this
 * ever exceeds them again.
 *
 * 1.3 rather than the limit: it leaves about 22px of air on the tightest edge at
 * the animation's widest moment, and the resting composition — which is what is
 * on screen almost all the time — sits at 81% of the box rather than pressed
 * against it.
 *
 * Applied in CSS to the icon box's children, both of them, so the animation and
 * the reduced-motion still are framed identically and nothing shifts when a
 * reader turns that preference on.
 */
export const ZOOM = 1.3;

/**
 * Whether a zoom keeps the whole animation inside the artboard.
 *
 * The crop scales about the resting centre, so each edge has its own limit and
 * the smallest one governs. Exported so a test can assert it rather than leaving
 * the number above to be checked by eye — which is how 1.5 shipped.
 */
export function zoomStaysInside(zoom: number): boolean {
  const halfW = ARTWORK.motionWidth / 2;
  const halfH = ARTWORK.motionHeight / 2;
  // The moving extent, centred on its own centre, expressed as edges relative
  // to the resting centre the crop scales about.
  const motionCentreX = ARTWORK.centreX + 9;
  const motionCentreY = ARTWORK.centreY - 8;

  const edges = [
    ARTWORK.centreX + zoom * (motionCentreX + halfW - ARTWORK.centreX),
    ARTWORK.centreX + zoom * (motionCentreX - halfW - ARTWORK.centreX),
    ARTWORK.centreY + zoom * (motionCentreY + halfH - ARTWORK.centreY),
    ARTWORK.centreY + zoom * (motionCentreY - halfH - ARTWORK.centreY),
  ];

  return edges.every((edge) => edge >= 0 && edge <= ARTBOARD);
}

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

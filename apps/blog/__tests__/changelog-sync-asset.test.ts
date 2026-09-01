import fs from 'node:fs';
import path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { readArchiveJson } from '../scripts/still-from-lottie.mjs';
import {
  ALL_STATES,
  EVENTS,
  LOTTIE_FILE,
  LOTTIE_SRC,
  STATE_FOR_STATUS,
  STATE_MACHINE,
  THEMES,
} from '../lib/changelog-sync-asset';

/**
 * The contract between `ChangelogSyncButton` and `changelog-sync.lottie`.
 *
 * Twelve names bind the two together, and until this file existed nothing
 * checked a single one of them. That gap was not academic: every call across
 * this boundary discards its own failure signal — `stateMachineLoad`,
 * `stateMachineStart`, `setTheme` and `stateMachineOverrideState` return a
 * boolean nobody reads, `stateMachineFireEvent` returns nothing — and the
 * acceptance suite deliberately never asserts on the icon, because pixels of a
 * canvas are visual-diff's business. So a Creator re-export that renamed one
 * state would leave the control mute, the animation frozen on its first frame,
 * and the entire gate green.
 *
 * That is the likeliest change to this asset, too: re-exporting it without its
 * `Click` interaction is already an open item.
 *
 * Read out of the shipped archive rather than a fixture, for the reason
 * `changelog-sync-still.test.ts` reads the same file: a fixture is a second
 * copy of the thing under test, and it drifts in exactly the case this exists
 * to catch.
 */

const manifest = readArchiveJson('manifest.json');
const machine = readArchiveJson(`s/${STATE_MACHINE}.json`);

/** Every state name the machine declares. */
const declaredStates: string[] = machine.states.map(
  (state: { name: string }) => state.name,
);

/** Every input the machine accepts. */
const declaredInputs: string[] = machine.inputs.map(
  (input: { name: string }) => input.name,
);

/** Copy-then-sort: `Array.prototype.sort` mutates, and these arrays are shared
 *  between cases. `toSorted` would say this in one word but is not in the lib
 *  this workspace compiles against. */
const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('the shipped .lottie', () => {
  it('is where the component asks for it', () => {
    // `LOTTIE_SRC` is a public URL and `LOTTIE_FILE` the path behind it; a typo
    // in either is a 404 the player reports to nobody — the still simply stays
    // up and the icon never animates.
    expect(fs.existsSync(path.resolve(__dirname, '..', LOTTIE_FILE))).toBe(true);
    expect(LOTTIE_SRC).toBe(`/${LOTTIE_FILE.replace(/^public\//, '')}`);
  });

  it('carries the state machine the component loads by name', () => {
    const ids = manifest.stateMachines.map((sm: { id: string }) => sm.id);

    expect(ids).toContain(STATE_MACHINE);
  });

  it('carries a theme for each of the two [data-theme] values', () => {
    const ids = manifest.themes.map((theme: { id: string }) => theme.id);

    expect(ids).toContain(THEMES.light);
    expect(ids).toContain(THEMES.dark);
  });
});

describe('the state machine', () => {
  it.each(Object.entries(STATE_FOR_STATUS))(
    'declares the state the control shows for %s',
    (_status, state) => {
      expect(declaredStates).toContain(state);
    },
  );

  it.each(Object.values(EVENTS))('accepts the input the control fires: %s', (event) => {
    expect(declaredInputs).toContain(event);
  });

  /**
   * The reverse direction, and the reason it is worth asserting: the four above
   * pass as long as those names survive, even if a re-export renamed something
   * else. `s-hover` is exactly that case — the control never drives it, so
   * nothing else here would notice it being renamed, and hover would silently
   * stop working. Pinning the whole set makes any rename a deliberate edit in
   * `lib/changelog-sync-asset.ts` rather than a silent regression.
   */
  it('declares exactly the states the app knows about, hover included', () => {
    expect(sorted(declaredStates)).toEqual(sorted(ALL_STATES));
  });

  it('accepts exactly the five inputs the control fires', () => {
    expect(sorted(declaredInputs)).toEqual(sorted(Object.values(EVENTS)));
  });

  /**
   * Not a requirement — a record of a known gap.
   *
   * The file still declares a `Click` pointer interaction, which is why
   * `LottieBlock` makes the canvas inert: the player wires a canvas listener for
   * every declared interaction, so a press would otherwise drive the machine
   * behind the component's back. When the asset is re-exported without it, this
   * expectation fails and is deleted — which is the point. It fails LOUDLY at
   * the moment the workaround stops being necessary, rather than leaving the
   * `pointer-events: none` in place forever with nothing left to explain it.
   */
  it('still declares the Click interaction the inert canvas exists to neutralise', () => {
    const interactions = machine.interactions.map((i: { type: string }) => i.type);

    expect(interactions).toContain('Click');
  });
});

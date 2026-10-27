import type { Ledger } from '@gate/visual-diff/ledger';
import { parseVariantKey } from '@gate/visual-diff/policy';
import { everyReading } from '@/lib/readings';
import { groupShots, type SetShot, type SetShots } from '@/lib/set-view';
import { setHref, shotViewHref } from '@/lib/shots';
import { shotProps } from '@/lib/shot-props';
import ledger from '../../fixtures/sets/main-2026-08-30/atoms__desktop__light__atoms-badge--accent.ledger.json';

/**
 * What a sample instance reads off `fixtures/` for the one set that ships its
 * shots, and for one shot in it, as literals — see `dashboard-sample.ts` for
 * why, and `__tests__/screen-samples.test.ts` for what holds it to the readers.
 */

export const SAMPLE_SET_LABEL = 'main-2026-08-30';

/** Each file with its PNG header's width and height and its bytes on disk, as
 *  `readSetShots` measures them. Sorted as `readdir` lists them; the grouping
 *  orders them itself. */
const FILES: readonly (readonly [
  file: string,
  width: number,
  height: number,
  bytes: number,
])[] = [
  ['atoms__desktop__dark__atoms-badge--accent.png', 1248, 25, 1230],
  ['atoms__desktop__dark__atoms-skeleton--line.png', 1248, 12, 284],
  ['atoms__desktop__light__atoms-badge--accent.png', 1248, 25, 1212],
  ['atoms__desktop__light__atoms-skeleton--line.png', 1248, 12, 291],
  ['molecules__desktop__dark__molecules-postcard--default.png', 1248, 162, 15782],
  ['molecules__desktop__light__molecules-postcard--default.png', 1248, 162, 15894],
  ['organisms__desktop__dark__organisms-siteheader--default.png', 1248, 61, 4800],
  ['organisms__desktop__light__organisms-siteheader--default.png', 1248, 61, 4848],
  ['organisms__mobile__dark__organisms-siteheader--default.png', 358, 61, 4343],
  ['organisms__mobile__light__organisms-siteheader--default.png', 358, 61, 4403],
  ['templates__desktop__dark__templates-posttemplate--default.png', 1248, 482, 40897],
  ['templates__desktop__light__templates-posttemplate--default.png', 1248, 482, 41349],
  ['templates__mobile__dark__templates-posttemplate--default.png', 358, 574, 38400],
  ['templates__mobile__light__templates-posttemplate--default.png', 358, 574, 39178],
];

const shots: SetShot[] = FILES.flatMap(([file, width, height, bytes]) => {
  const key = file.slice(0, -'.png'.length);
  const variant = parseVariantKey(key);

  return variant
    ? [
        {
          key,
          file,
          tier: variant.tier,
          viewport: variant.viewport,
          theme: variant.theme,
          storyId: variant.id,
          width,
          height,
          bytes,
        },
      ]
    : [];
});

/** The set as `readSetShots` returns it for a capture set: no host stamp, and
 *  nothing in the directory it could not place. */
export const SAMPLE_SET_SHOTS: SetShots = {
  label: SAMPLE_SET_LABEL,
  isCanonical: false,
  sections: groupShots(shots),
  shots: shots.length,
  bytes: shots.reduce((total, shot) => total + shot.bytes, 0),
  ignored: [],
  env: null,
};

/** A shot with a token ledger beside it, so the view draws its readings. */
export const SAMPLE_SHOT_KEY = 'atoms__desktop__light__atoms-badge--accent';

const shot = shotProps(SAMPLE_SET_LABEL, SAMPLE_SET_SHOTS, SAMPLE_SHOT_KEY);
// Unreachable while the key is one of FILES above, and said loudly if it stops
// being: a story drawn over no shot would photograph an empty frame.
if (!shot) throw new Error(`${SAMPLE_SHOT_KEY} is not in ${SAMPLE_SET_LABEL}`);

export const SAMPLE_SHOT = shot;

/** As `readSetLedger` turns the sidecar into the panel's rows. The JSON import
 *  widens the enums, so the type is asserted, and the test is what checks it. */
export const SAMPLE_SHOT_READINGS = everyReading(ledger as unknown as Ledger);

export const SAMPLE_SET_PATH = setHref(SAMPLE_SET_LABEL);
export const SAMPLE_SHOT_PATH = shotViewHref(SAMPLE_SET_LABEL, SAMPLE_SHOT_KEY);

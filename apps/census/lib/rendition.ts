/**
 * Whether the home draws the testing pyramid as a 3D scene or as the flat
 * figure, decided once per visit from what the browser reports.
 *
 * The flat `TestPyramid` is the content: it is what Storybook and the captures
 * show, and what a screen reader reads in every case. The scene is decoration
 * on top of it, so every doubt answers `flat`.
 */

/** `still` is the scene with its controls off: reduced motion asks for no movement. */
export type Rendition = 'scene' | 'still' | 'flat';

export interface RenditionInputs {
  /** What `localStorage` remembered from an earlier visit, if anything. */
  remembered: string | null;
  webgl2: boolean;
  reducedMotion: boolean;
  /** `navigator.connection.saveData`, where the browser has it. */
  saveData: boolean;
  /** `navigator.hardwareConcurrency`, where the browser has it. */
  cores?: number;
  /** `navigator.deviceMemory` in GB, where the browser has it. */
  memoryGb?: number;
  /** detect-gpu's tier, 0–3; absent when the probe could not tell. */
  gpuTier?: number;
}

export interface RenditionChoice {
  rendition: Rendition;
  /** True when the visit should be remembered as flat for the next ones. */
  remember: boolean;
}

/** The `localStorage` key, and the one value written under it. */
export const REMEMBER_KEY = 'census:pyramid';
export const REMEMBERED_FLAT = 'flat';

/** At or under these, the device is low-power and gets the flat figure. */
export const LOW_CORES = 2;
export const LOW_MEMORY_GB = 2;

/** detect-gpu's tier 0 is a GPU too slow or blocklisted to draw the scene. */
export const MIN_GPU_TIER = 1;

const flat = (remember: boolean): RenditionChoice => ({ rendition: 'flat', remember });

const lowPower = ({ saveData, cores, memoryGb }: RenditionInputs) =>
  saveData ||
  (cores !== undefined && cores <= LOW_CORES) ||
  (memoryGb !== undefined && memoryGb <= LOW_MEMORY_GB);

/**
 * The rendition for this visit. Only a slow GPU is remembered: the device does not
 * change between visits, while a save-data switch or a missing WebGL2 is read
 * again each time and costs nothing to read.
 */
export function rendition(inputs: RenditionInputs): RenditionChoice {
  if (inputs.remembered === REMEMBERED_FLAT) return flat(false);
  if (!inputs.webgl2 || lowPower(inputs)) return flat(false);
  if (inputs.gpuTier === undefined) return flat(false);
  if (inputs.gpuTier < MIN_GPU_TIER) return flat(true);

  return { rendition: inputs.reducedMotion ? 'still' : 'scene', remember: false };
}

/**
 * A tier forced from the address, `?gpu-tier=0`, so the fallback can be seen on a
 * machine that would draw the scene. Anything but a whole tier 0–3 is ignored.
 */
export function forcedTier(search: string): number | undefined {
  const value = new URLSearchParams(search).get('gpu-tier');
  if (value === null || !/^[0-3]$/.test(value)) return undefined;

  return Number(value);
}

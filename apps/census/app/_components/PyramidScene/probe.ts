import { getGPUTier } from 'detect-gpu';

import {
  forcedTier,
  REMEMBER_KEY,
  REMEMBERED_FLAT,
  rendition,
  type Rendition,
} from '@/lib/rendition.ts';

/** The self-hosted copies `app/gpu-benchmarks/[file]/route.ts` serves. */
const BENCHMARKS_URL = '/gpu-benchmarks';

type ProbedNavigator = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/** Storage can throw (private windows, blocked site data): every access is guarded. */
function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

/** Remember this device as flat, so later visits skip the probe and the scene. */
export function rememberFlat(): void {
  try {
    window.localStorage.setItem(REMEMBER_KEY, REMEMBERED_FLAT);
  } catch {
    // Unremembered: the next visit probes again and reaches the same answer.
  }
}

function hasWebgl2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

async function gpuTier(): Promise<number | undefined> {
  try {
    return (await getGPUTier({ benchmarksURL: BENCHMARKS_URL })).tier;
  } catch {
    return undefined;
  }
}

/**
 * Gathers what `rendition()` decides on and returns its answer, remembering a
 * flat answer when it asks to. Runs once per visit, after hydration.
 */
export async function probe(): Promise<Rendition> {
  const remembered = readRemembered();
  const webgl2 = remembered === REMEMBERED_FLAT ? false : hasWebgl2();
  const forced = forcedTier(window.location.search);
  const nav = navigator as ProbedNavigator;

  const choice = rendition({
    remembered,
    webgl2,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: nav.connection?.saveData === true,
    cores: nav.hardwareConcurrency || undefined,
    memoryGb: nav.deviceMemory,
    gpuTier: forced ?? (webgl2 ? await gpuTier() : undefined),
  });

  if (choice.remember) rememberFlat();

  return choice.rendition;
}

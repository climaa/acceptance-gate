import { describe, expect, it } from 'vitest';

import {
  forcedTier,
  LOW_CORES,
  LOW_MEMORY_GB,
  MIN_GPU_TIER,
  REMEMBERED_FLAT,
  rendition,
  type RenditionInputs,
} from '@/lib/rendition.ts';

/** A capable desktop: every input on its own would draw the scene. */
const CAPABLE: RenditionInputs = {
  remembered: null,
  webgl2: true,
  reducedMotion: false,
  saveData: false,
  cores: 8,
  memoryGb: 8,
  gpuTier: 3,
};

const choose = (overrides: Partial<RenditionInputs>) =>
  rendition({ ...CAPABLE, ...overrides });

describe('rendition', () => {
  it('draws the scene on a capable device', () => {
    expect(choose({})).toEqual({ rendition: 'scene', remember: false });
  });

  it('holds the scene still under reduced motion', () => {
    expect(choose({ reducedMotion: true })).toEqual({
      rendition: 'still',
      remember: false,
    });
  });

  it('keeps a remembered flat visit flat without remembering it again', () => {
    expect(choose({ remembered: REMEMBERED_FLAT })).toEqual({
      rendition: 'flat',
      remember: false,
    });
  });

  it('ignores a remembered value it never writes', () => {
    expect(choose({ remembered: 'scene' }).rendition).toBe('scene');
  });

  it('falls back without WebGL2', () => {
    expect(choose({ webgl2: false })).toEqual({ rendition: 'flat', remember: false });
  });

  it('falls back when the visitor asked to save data', () => {
    expect(choose({ saveData: true }).rendition).toBe('flat');
  });

  it('falls back at the low core count, not above it', () => {
    expect(choose({ cores: LOW_CORES }).rendition).toBe('flat');
    expect(choose({ cores: LOW_CORES + 1 }).rendition).toBe('scene');
  });

  it('falls back at the low memory, not above it', () => {
    expect(choose({ memoryGb: LOW_MEMORY_GB }).rendition).toBe('flat');
    expect(choose({ memoryGb: LOW_MEMORY_GB * 2 }).rendition).toBe('scene');
  });

  it('draws the scene when the browser hides cores and memory', () => {
    expect(choose({ cores: undefined, memoryGb: undefined }).rendition).toBe('scene');
  });

  it('falls back, unremembered, when the GPU probe could not tell', () => {
    expect(choose({ gpuTier: undefined })).toEqual({
      rendition: 'flat',
      remember: false,
    });
  });

  it('falls back on a slow GPU and remembers it', () => {
    expect(choose({ gpuTier: MIN_GPU_TIER - 1 })).toEqual({
      rendition: 'flat',
      remember: true,
    });
  });

  it('draws the scene from the lowest tier that can', () => {
    expect(choose({ gpuTier: MIN_GPU_TIER }).rendition).toBe('scene');
  });

  it('lets a low-power device win over a slow GPU, so nothing is remembered', () => {
    expect(choose({ saveData: true, gpuTier: 0 })).toEqual({
      rendition: 'flat',
      remember: false,
    });
  });
});

describe('forcedTier', () => {
  it('reads a whole tier from the address', () => {
    expect(forcedTier('?gpu-tier=0')).toBe(0);
    expect(forcedTier('?dimension=code&gpu-tier=3')).toBe(3);
  });

  it('ignores an address without one', () => {
    expect(forcedTier('')).toBeUndefined();
  });

  it.each(['4', '-1', '1.5', 'low', ''])('ignores gpu-tier=%s', (value) => {
    expect(forcedTier(`?gpu-tier=${value}`)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { MODES, TIERS, VIEWPORTS } from '../policy.mjs';

describe('TIERS', () => {
  it('lists the four atomic-design tiers, innermost first', () => {
    const tiers = TIERS;

    expect(tiers).toEqual(['atoms', 'molecules', 'organisms', 'templates']);
  });
});

describe('MODES', () => {
  it('has 12 entries: atoms 1x2, molecules 1x2, organisms 2x2, templates 2x2', () => {
    const modes = MODES;

    expect(modes).toHaveLength(12);
  });

  it('uses only viewports that exist in VIEWPORTS', () => {
    const modes = MODES;

    for (const mode of modes) {
      expect(Object.keys(VIEWPORTS)).toContain(mode.viewport);
    }
  });

  it('captures atoms and molecules only at desktop', () => {
    const modes = MODES;

    const innerTierModes = modes.filter(
      (mode) => mode.tier === 'atoms' || mode.tier === 'molecules',
    );

    for (const mode of innerTierModes) {
      expect(mode.viewport).toBe('desktop');
    }
  });

  it('captures organisms and templates at both desktop and mobile', () => {
    const modes = MODES;

    for (const tier of ['organisms', 'templates']) {
      const viewportsForTier = modes
        .filter((mode) => mode.tier === tier)
        .map((mode) => mode.viewport);

      expect(new Set(viewportsForTier)).toEqual(new Set(['desktop', 'mobile']));
    }
  });
});

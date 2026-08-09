import { describe, expect, it } from 'vitest';
import { MODES, THEMES, TIERS, VIEWPORTS } from '../policy.mjs';

const viewportsFor = (tier) =>
  new Set(MODES.filter((mode) => mode.tier === tier).map((mode) => mode.viewport));

const themesFor = (tier, viewport) =>
  MODES.filter((mode) => mode.tier === tier && mode.viewport === viewport).map(
    (mode) => mode.theme,
  );

describe('TIERS', () => {
  it('lists the four atomic-design tiers, innermost first', () => {
    expect(TIERS).toEqual(['atoms', 'molecules', 'organisms', 'templates']);
  });
});

describe('MODES', () => {
  it('has 12 entries: atoms 1x2, molecules 1x2, organisms 2x2, templates 2x2', () => {
    expect(MODES).toHaveLength(12);
  });

  it('uses only viewports that exist in VIEWPORTS', () => {
    const knownViewports = Object.keys(VIEWPORTS);

    for (const mode of MODES) {
      expect(knownViewports).toContain(mode.viewport);
    }
  });

  it('captures atoms and molecules only at desktop', () => {
    for (const tier of ['atoms', 'molecules']) {
      expect(viewportsFor(tier)).toEqual(new Set(['desktop']));
    }
  });

  it('captures organisms and templates at both desktop and mobile', () => {
    for (const tier of ['organisms', 'templates']) {
      expect(viewportsFor(tier)).toEqual(new Set(['desktop', 'mobile']));
    }
  });

  it('captures every tier/viewport cell in each theme exactly once', () => {
    for (const mode of MODES) {
      expect(themesFor(mode.tier, mode.viewport)).toEqual(THEMES);
    }
  });
});

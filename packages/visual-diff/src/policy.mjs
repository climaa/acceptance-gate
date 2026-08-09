/** Atomic-design tiers, innermost first. Import order matters: the layering rule
 *  allows a tier to import only from tiers earlier in this array. */
export const TIERS = ['atoms', 'molecules', 'organisms', 'templates'];

/** Theme values. Selected via `data-theme` on <html> — never prefers-color-scheme. */
export const THEMES = ['light', 'dark'];

/** Capture viewports, in CSS pixels at deviceScaleFactor 1. */
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

/** Tier → the viewports that tier is captured at.
 *  Atoms and molecules do not change shape between viewports, so capturing them
 *  at mobile would double the baseline count and catch nothing. */
export const TIER_VIEWPORTS = {
  atoms: ['desktop'],
  molecules: ['desktop'],
  organisms: ['desktop', 'mobile'],
  templates: ['desktop', 'mobile'],
};

/** The full capture matrix: one entry per (tier, viewport, theme) cell. */
export const MODES = TIERS.flatMap((tier) =>
  TIER_VIEWPORTS[tier].flatMap((viewport) =>
    THEMES.map((theme) => ({ tier, viewport, theme })),
  ),
);

/** Applied to a story that cannot be captured deterministically. Requires a reason;
 *  the report lists skipped stories rather than hiding them. */
export const SKIP_TAG = 'visual-diff:skip';

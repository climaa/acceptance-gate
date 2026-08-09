// Tier names are read from policy.mjs and never copied here: the same array drives
// the Storybook globals and the visual-diff capture matrix, so adding a tier there
// extends this rule with no edit in this file.
import { TIERS } from '@gate/visual-diff/policy';
import tsParser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';

const barrelOf = (tier) => `${tier}-barrel`;

// Two element types per tier: one per component folder (`src/<tier>/<Name>/`), plus
// the tier root — `src/<tier>/index.ts`, the barrel — as an element of its own.
// Without that second descriptor the barrel matches no element at all and a barrel
// re-exporting across tiers goes unchecked, which is the violation most worth
// catching. Element patterns match folders, so the barrel is addressed by its
// directory rather than by a `*.ts` glob.
const elements = TIERS.flatMap((tier) => [
  { type: tier, pattern: `src/${tier}/**/*` },
  { type: barrelOf(tier), pattern: `src/${tier}` },
]);

const allowFrom = (fromType, toTypes) => ({
  from: { element: { type: fromType } },
  allow: { to: { element: { types: { anyOf: toTypes } } } },
});

// atoms ← molecules ← organisms ← templates: a tier may depend only on the tiers
// before it in TIERS, reached either directly or through their barrels. Everything
// not listed here — a later tier, a same-tier sibling — is an error via
// `default: 'disallow'` below. The one same-tier edge the layering has to permit is
// a barrel re-exporting its own tier; a component reaching a sibling through that
// same barrel is not covered by it and stays a violation.
const policies = TIERS.flatMap((tier, index) => {
  const innerTypes = TIERS.slice(0, index).flatMap((inner) => [inner, barrelOf(inner)]);
  const barrelPolicy = allowFrom(barrelOf(tier), [tier, ...innerTypes]);

  // The innermost tier has nothing to reach for, so its components get no policy.
  if (innerTypes.length === 0) return [barrelPolicy];

  return [barrelPolicy, allowFrom(tier, innerTypes)];
});

const config = [
  // `eslint .` lints everything not ignored. These are never sources.
  { ignores: ['node_modules/**', '.turbo/**', 'coverage/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser },
    plugins: { boundaries },
    settings: {
      // The default resolver only knows .js; without this every local import
      // resolves to nothing and the layering rule passes by never seeing an edge.
      'import/resolver': { node: { extensions: ['.ts', '.tsx'] } },
      'boundaries/elements': elements,
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies }],
    },
  },
];

export default config;

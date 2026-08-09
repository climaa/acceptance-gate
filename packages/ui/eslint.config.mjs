import { TIERS } from '@gate/visual-diff/policy';
import tsParser from '@typescript-eslint/parser';
import boundaries from 'eslint-plugin-boundaries';

// The tier names are read from policy.mjs and never copied here: the same array
// drives the Storybook globals and the visual-diff capture matrix.
const barrelOf = (tier) => `${tier}-barrel`;

// Two element types per tier: one component folder (`src/<tier>/<Name>/`) per
// element, plus the tier root — `src/<tier>/index.ts`, the barrel — as an element
// of its own. Without that second descriptor the barrel matches no element at all
// and a barrel re-exporting across tiers goes unchecked, which is the violation
// most worth catching. Element patterns match folders, so the barrel is addressed
// by its directory rather than by a `*.ts` glob.
const elements = TIERS.flatMap((tier) => [
  { type: tier, pattern: `src/${tier}/**/*` },
  { type: barrelOf(tier), pattern: `src/${tier}` },
]);

// atoms ← molecules ← organisms ← templates: a tier may depend only on the tiers
// before it in TIERS, reached either directly or through their barrels. Everything
// not listed here — a later tier, a same-tier sibling — is an error via
// `default: 'disallow'` below. The one same-tier edge the layering has to permit is
// a barrel re-exporting its own tier; a component reaching a sibling through that
// same barrel is not covered by it and stays a violation.
const policies = TIERS.flatMap((tier, index) => {
  const inward = TIERS.slice(0, index).flatMap((earlier) => [earlier, barrelOf(earlier)]);
  const allowTo = (types) => ({
    allow: { to: { element: { types: { anyOf: types } } } },
  });

  return [
    { from: { element: { type: barrelOf(tier) } }, ...allowTo([tier, ...inward]) },
    ...(inward.length === 0
      ? []
      : [{ from: { element: { type: tier } }, ...allowTo(inward) }]),
  ];
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

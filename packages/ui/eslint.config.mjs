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

// atoms ← molecules ← organisms ← templates: a component may depend on its own
// tier and on the tiers before it in TIERS, reached either directly or through
// those tiers' barrels. A later tier is an error via `default: 'disallow'` below,
// which is the direction the layering exists to forbid — a molecule can never
// import an organism.
//
// The same tier is allowed on purpose: composition within a tier is how the board
// draws it (a card molecule holding smaller molecules), so a rule forbidding it
// would make components the inventory names unbuildable. What stays a violation is
// reaching a sibling through the tier's own barrel — the barrel is allowed to
// re-export its tier, but that allowance is granted to the barrel element, never
// to a component importing from it.
const policies = TIERS.flatMap((tier, index) => {
  const innerTypes = TIERS.slice(0, index).flatMap((inner) => [inner, barrelOf(inner)]);
  // The barrel and its components reach exactly the same set; only the direction
  // they may be reached *from* differs, which is what keeps sibling-via-barrel out.
  const reachableTypes = [tier, ...innerTypes];

  return [allowFrom(barrelOf(tier), reachableTypes), allowFrom(tier, reachableTypes)];
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

// The plugin Storybook's own init installs. `storybook/no-uninstalled-addons` is
// what earns it today: it reads `.storybook/main.ts` and fails on an addon listed
// there but missing from package.json — a broken build the config alone cannot
// show. The story rules are dormant until the three story issues land.
import tsParser from '@typescript-eslint/parser';
import storybook from 'eslint-plugin-storybook';

const config = [
  // `eslint .` lints everything not ignored. These are build output, never sources.
  { ignores: ['storybook-static/**', '.turbo/**'] },
  ...storybook.configs['flat/recommended'],
  // The plugin's configs reach `.storybook/main.ts` and, later, `*.stories.tsx`;
  // the default parser reads neither.
  { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tsParser } },
];

export default config;

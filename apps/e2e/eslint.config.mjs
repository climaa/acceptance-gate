import tsParser from '@typescript-eslint/parser';

const config = [
  // `eslint .` lints everything not ignored. `.features-gen` is bddgen output and
  // the other two are run artifacts — none of them are sources.
  {
    ignores: [
      '.features-gen/**',
      'playwright-report*/**',
      'test-results*/**',
      '.turbo/**',
    ],
  },
  // The default parser reads no TypeScript, and every source here is TypeScript.
  { files: ['**/*.ts'], languageOptions: { parser: tsParser } },
];

export default config;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  // `eslint .` lints everything not ignored. These are build output, never linted.
  { ignores: ['.next/**', '.turbo/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    files: [
      'app/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'content/**/*.{ts,tsx}',
      // Root-level, and shipped: Next loads this entry point before any app
      // code runs.
      'proxy.ts',
    ],
    rules: { 'no-console': 'error' },
  },
];

export default config;

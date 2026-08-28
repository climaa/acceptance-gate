import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  // `eslint .` lints everything not ignored. These are build output, never linted.
  { ignores: ['.next/**', '.turbo/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
      'proxy.ts',
      // Root-level like proxy.ts, and shipped like it: Next loads both realm
      // entry points before any app code runs.
      'instrumentation.ts',
      'instrumentation-client.ts',
    ],
    rules: { 'no-console': 'error' },
  },
];

export default config;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  // `eslint .` lints everything not ignored. These are build output, never linted.
  { ignores: ['.next/**', '.turbo/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    files: ['lib/**/*.{ts,tsx}'],
    rules: { 'no-console': 'error' },
  },
];

export default config;

import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  // `eslint .` lints everything not ignored. These are build output, never linted.
  { ignores: ['.next/**', '.turbo/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    // A `key` written after a `{...}` spread is not statically visible to the
    // JSX transform, so `jsx()` takes it as an ordinary prop and the element
    // keeps `key: null`. Next's SWC does exactly that; vitest's oxc does not —
    // which is why this is a lint rule and not a test. The set viewer's tier
    // nav shipped it (#557), and the only report of it was the dev overlay's
    // React warning. Ported from portafolio, which caught it first.
    rules: { 'react/jsx-key': ['error', { checkKeyMustBeforeSpread: true }] },
  },
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

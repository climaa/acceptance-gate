import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  // `next lint` scoped itself to app/pages/components/lib/src; `eslint .` (arriving in #69) does
  // not. These are build output, never linted.
  { ignores: ['.next/**', '.turbo/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals'),
];

export default config;

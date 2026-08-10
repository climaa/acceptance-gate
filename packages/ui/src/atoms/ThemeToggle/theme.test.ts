import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY } from './theme';

/**
 * The storage key is a contract between two processes, not a component detail:
 * ThemeToggle writes it in the browser, and the blog's pre-hydration script
 * inlines it into the HTML on the server. This suite pins the half of that
 * contract no render can show — see theme.ts for why the constant does not live
 * in ThemeToggle.tsx.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A directive prologue precedes every statement, so anchoring at the start of
 * the file — past comments and blank lines — is the whole search space. Matching
 * the bare words anywhere would also match this file's own prose about them.
 */
const USE_CLIENT = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*['"]use client['"]/;

describe('THEME_STORAGE_KEY', () => {
  // Spelled out rather than imported: an expectation that reads the value under
  // test cannot catch that value changing, and a changed key is a reader whose
  // stored choice is silently forgotten.
  it('is the key already in visitors’ browsers', () => {
    expect(THEME_STORAGE_KEY).toBe('gate-theme');
  });

  // A `'use client'` module reaches a React Server Component only as a client
  // reference: the server sees a throwing proxy where the string should be, and
  // inlines that into the script tag. Nothing renders differently in this
  // package's tests or the blog's — the flash simply comes back in production.
  it('is exported from a module a server component can read', () => {
    const source = readFileSync(join(HERE, 'theme.ts'), 'utf8');

    expect(USE_CLIENT.test(source)).toBe(false);
  });
});

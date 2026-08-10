import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  colorRoles,
  extractDeclarations,
  fontSizeSteps,
  resolveVar,
} from '../src/docs/tokens';

/**
 * The Tokens docs page renders tokens.css rather than retyping its values, so
 * the parser it leans on is tested against a small fixture (fast, precise
 * failure messages) and then sanity-checked against the real file (catches
 * the parser silently matching nothing there while the fixture still passes).
 */

// The header comment is load-bearing, not decoration: the real sheet names both
// selectors in prose above the rules, and a parser searching the raw text lands
// on that mention instead of on the rule.
const FIXTURE = `
/* Every --color-* role in :root is also remapped in [data-theme='dark']. */

:root {
  /* raw family */
  --c-cream-100: #ede6d6;
  --color-bg: var(--c-cream-100);
  --color-text: #111111;
  --text-sm: 0.875rem;
  --text-base: 1rem;
}

[data-theme='dark'] {
  --color-bg: #000000;
}
`;

describe('extractDeclarations', () => {
  it('reads every custom property declared in the selector block', () => {
    const root = extractDeclarations(FIXTURE, ':root');

    expect(root.get('--color-bg')).toBe('var(--c-cream-100)');
    expect(root.get('--text-sm')).toBe('0.875rem');
  });

  it('stops at the block’s closing brace, not a later one', () => {
    const dark = extractDeclarations(FIXTURE, "[data-theme='dark']");

    expect([...dark.keys()]).toEqual(['--color-bg']);
  });

  it('finds the rule, not an earlier mention of the selector in a comment', () => {
    const dark = extractDeclarations(FIXTURE, "[data-theme='dark']");

    expect(dark.get('--color-bg')).toBe('#000000');
  });

  it('throws when the selector has no rule in the sheet', () => {
    expect(() => extractDeclarations(FIXTURE, '.missing')).toThrow();
  });
});

describe('resolveVar', () => {
  it('follows a var() chain to its literal', () => {
    const root = extractDeclarations(FIXTURE, ':root');

    expect(resolveVar(root, '--color-bg')).toBe('#ede6d6');
  });

  it('returns a literal declaration unchanged', () => {
    const root = extractDeclarations(FIXTURE, ':root');

    expect(resolveVar(root, '--color-text')).toBe('#111111');
  });

  it('throws when the token is not declared', () => {
    const root = extractDeclarations(FIXTURE, ':root');

    expect(() => resolveVar(root, '--color-missing')).toThrow();
  });
});

describe('colorRoles', () => {
  it('pairs every --color-* role with its light and dark literal', () => {
    const roles = colorRoles(FIXTURE);

    expect(roles).toEqual([
      { name: '--color-bg', light: '#ede6d6', dark: '#000000' },
      { name: '--color-text', light: '#111111', dark: '#111111' },
    ]);
  });

  it('excludes raw --c-* families — components consume roles only', () => {
    const roles = colorRoles(FIXTURE);

    expect(roles.some((role) => role.name.startsWith('--c-'))).toBe(false);
  });
});

describe('fontSizeSteps', () => {
  it('reads the --text-* scale in declaration order', () => {
    expect(fontSizeSteps(FIXTURE)).toEqual([
      { name: '--text-sm', value: '0.875rem' },
      { name: '--text-base', value: '1rem' },
    ]);
  });
});

describe('against the real tokens.css', () => {
  const REAL = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../../packages/ui/src/tokens.css'),
    'utf8',
  );

  it('parses every --color-* role declared in :root', () => {
    // Independent of extractDeclarations' brace-matching: the dark *rule* (not
    // one of the comments mentioning it above :root) starts the dark block, so
    // slicing there isolates :root without re-deriving the parser's own logic.
    const [rootText = ''] = REAL.split("[data-theme='dark'] {");
    const declaredCount = [...rootText.matchAll(/^\s*(--color-[\w-]+):/gm)].length;

    expect(colorRoles(REAL)).toHaveLength(declaredCount);
  });

  it('takes a remapped role’s dark literal from the dark block, not from :root', () => {
    // Same hand-cut slice as above, for the same reason. A role appears in the
    // dark block precisely because the two themes differ there, so reading one
    // back as its light value means the dark block was never opened.
    const [, darkText = ''] = REAL.split("[data-theme='dark'] {");
    const remapped = new Set(
      [...darkText.matchAll(/^\s*(--color-[\w-]+):/gm)].map(([, name]) => name),
    );

    const roles = colorRoles(REAL).filter((role) => remapped.has(role.name));

    expect(roles).not.toHaveLength(0);
    for (const role of roles) {
      expect(role.dark, role.name).not.toBe(role.light);
    }
  });

  it('reads a non-empty type scale', () => {
    expect(fontSizeSteps(REAL).length).toBeGreaterThan(0);
  });
});

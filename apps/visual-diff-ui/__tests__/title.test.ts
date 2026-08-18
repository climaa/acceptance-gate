// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { storyTitle } from '../lib/title';

/**
 * A story slug is the only name the differ records, and it is a Storybook id:
 * lowercased, hyphenated, tier-prefixed. The report shows a human the component
 * and the variant instead, so the derivation is a rule rather than a lookup —
 * and the three vectors below are asserted verbatim downstream.
 */

describe('storyTitle', () => {
  it.each([
    ['templates-posttemplate--long-prose', 'PostTemplate — Long Prose'],
    ['molecules-taglist--empty', 'TagList — Empty'],
    ['atoms-badge--tones', 'Badge — Tones'],
  ])('derives %s as the pinned title', (slug, expected) => {
    const title = storyTitle(slug);

    expect(title).toBe(expected);
  });

  it.each(['atoms', 'molecules', 'organisms', 'templates', 'pages'])(
    'strips the %s tier prefix',
    (tier) => {
      const title = storyTitle(`${tier}-badge--tones`);

      expect(title).toBe('Badge — Tones');
    },
  );

  it('restores the canonical casing of a compound component name', () => {
    const title = storyTitle('molecules-codeblock--with-language');

    expect(title).toBe('CodeBlock — With Language');
  });

  it('keeps a slug that carries no variant half to one title', () => {
    const title = storyTitle('organisms-siteheader');

    expect(title).toBe('SiteHeader');
  });

  // The tier prefix is stripped once, from the front. A component whose own name
  // begins with a tier word keeps it — `atoms-atomsgrid--default` is a grid, not
  // a grid in the atoms tier twice over.
  it('strips the tier prefix only once', () => {
    const title = storyTitle('atoms-atoms-badge--tones');

    expect(title).toBe('Atoms Badge — Tones');
  });

  it('falls back to the slug itself when it names nothing derivable', () => {
    const title = storyTitle('');

    expect(title).toBe('');
  });
});

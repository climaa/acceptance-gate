// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { SITE_URL } from '@/lib/site';

/**
 * What `/robots.txt` tells a crawler: read everything, and find the page list at
 * the sitemap. Next serialises the returned object, so the object is the
 * contract — pinned here as a crawler would read it.
 *
 * The origin is read from `lib/site.ts` rather than retyped, so a domain move
 * changes one constant and no test; what cannot change silently is that the
 * sitemap line is a full URL on that origin.
 */
describe('app/robots.ts', () => {
  it('allows every crawler to read every page', () => {
    const { rules } = robots();

    expect(rules).toEqual({ userAgent: '*', allow: '/' });
  });

  it('disallows nothing', () => {
    const { rules } = robots();

    expect(rules).not.toHaveProperty('disallow');
  });

  // The one robots.txt directive that takes a full URL rather than a path: a
  // relative sitemap line is ignored by crawlers.
  it('points at the sitemap by absolute URL on the deployed origin', () => {
    const { sitemap } = robots();

    expect(sitemap).toBe(`${SITE_URL.origin}/sitemap.xml`);
  });

  it('names a single sitemap and no host override', () => {
    const result = robots();

    expect(typeof result.sitemap).toBe('string');
    expect(result).not.toHaveProperty('host');
  });
});

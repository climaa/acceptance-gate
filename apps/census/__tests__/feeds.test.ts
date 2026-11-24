import { describe, expect, it } from 'vitest';

import { generateStaticParams } from '@/app/[workspace]/page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';

// Duplicated from lib/site.ts on purpose: an expectation that imports the value
// under test cannot catch that value being wrong.
const ORIGIN = 'https://census.carloslima.dev';

describe('app/sitemap', () => {
  it('lists the home and every workspace page the build prerenders, once each', async () => {
    const params = await generateStaticParams();

    const urls = (await sitemap()).map(({ url }) => url);

    expect(params.length).toBeGreaterThan(0);
    expect(urls).toEqual([
      `${ORIGIN}/`,
      ...params.map(({ workspace }) => `${ORIGIN}/${workspace}`),
    ]);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('app/robots', () => {
  it('allows everything and names the sitemap by its absolute address', () => {
    const { rules, sitemap: address } = robots();

    expect(rules).toEqual({ userAgent: '*', allow: '/' });
    expect(address).toBe(`${ORIGIN}/sitemap.xml`);
  });
});

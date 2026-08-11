import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { buildSummary } from '../artifacts.mjs';
import { TIERS } from '../policy.mjs';
import { renderReport } from '../report-html.mjs';

const ENV = {
  platform: 'linux',
  arch: 'x64',
  image: 'v1.62.1-noble',
  playwright: '1.62.1',
};

/** A comparison row, shaped like `compare.mjs`'s `Comparison` — the same fixture shape
 *  `artifacts.test.mjs` builds by hand, since `buildSummary` is what turns it into the
 *  `SummaryVariant[]` this module actually renders. */
function row(overrides = {}) {
  return {
    key: 'atoms__desktop__light__button--primary',
    id: 'button--primary',
    tier: 'atoms',
    viewport: 'desktop',
    theme: 'light',
    bucket: 'unchanged',
    pass: true,
    overlapDiffPixels: 0,
    marginPixels: 0,
    diffPixels: 0,
    allowedDiffPixels: 40,
    width: 200,
    height: 100,
    sizeDelta: null,
    violations: [],
    error: null,
    diff: null,
    ...overrides,
  };
}

const changedRow = (overrides = {}) =>
  row({
    bucket: 'changed',
    pass: false,
    overlapDiffPixels: 312,
    diffPixels: 312,
    diff: new Uint8Array([1, 2, 3]),
    ...overrides,
  });

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);
const PNG_DATA_URI = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

/** @param {string} haystack @param {string} needle */
function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('renderReport', () => {
  it('contains no external asset references or fetch calls', () => {
    const summary = buildSummary([row(), changedRow()], ENV);
    const images = new Map([
      [changedRow().key, { baseline: PNG_BYTES, candidate: PNG_BYTES, diff: PNG_BYTES }],
    ]);

    const html = renderReport(summary, images);
    const withoutDeepLinks = html.replaceAll(
      /https?:\/\/localhost:6006\/iframe\.html\?[^"'\s]*/g,
      '',
    );

    expect(html).not.toContain('fetch(');
    expect(withoutDeepLinks).not.toMatch(/https?:\/\//);
  });

  it('renders every failing variant exactly once; unchanged appears only in the counts header', () => {
    const summary = buildSummary(
      [
        row({ key: 'u1', id: 'unchanged-one' }),
        row({ key: 'u2', id: 'unchanged-two' }),
        changedRow({ key: 'c1', id: 'changed-one' }),
        changedRow({ key: 'c2', id: 'changed-two' }),
      ],
      ENV,
    );

    const html = renderReport(summary, new Map());

    expect(countOccurrences(html, '<h3>changed-one</h3>')).toBe(1);
    expect(countOccurrences(html, '<h3>changed-two</h3>')).toBe(1);
    expect(html).not.toContain('unchanged-one');
    expect(html).not.toContain('unchanged-two');
    expect(html).toContain('unchanged 2');
  });

  it('groups the changed bucket by tier in TIERS order, worst-first within a group', () => {
    const summary = buildSummary(
      [
        changedRow({ key: 'a1', id: 'atoms-low', tier: 'atoms', overlapDiffPixels: 10 }),
        changedRow({
          key: 'a2',
          id: 'atoms-high',
          tier: 'atoms',
          overlapDiffPixels: 500,
        }),
        changedRow({
          key: 't1',
          id: 'templates-one',
          tier: 'templates',
          overlapDiffPixels: 200,
        }),
        changedRow({
          key: 'm1',
          id: 'molecules-one',
          tier: 'molecules',
          overlapDiffPixels: 50,
        }),
      ],
      ENV,
    );

    const html = renderReport(summary, new Map());

    const cardOrder = ['atoms-high', 'atoms-low', 'molecules-one', 'templates-one'].map(
      (id) => html.indexOf(id),
    );
    cardOrder.forEach((index) => expect(index).toBeGreaterThan(-1));
    expect(cardOrder).toEqual([...cardOrder].sort((left, right) => left - right));

    const headingOrder = TIERS.filter((tier) => html.includes(`<h2>${tier}</h2>`)).map(
      (tier) => html.indexOf(`<h2>${tier}</h2>`),
    );
    expect(headingOrder).toEqual([...headingOrder].sort((left, right) => left - right));
  });

  it('inlines data-URI images for variants that have buffers, and a placeholder where a bucket has none', () => {
    const changed = changedRow({ key: 'c1', id: 'has-images' });
    const added = row({
      key: 'a1',
      id: 'brand-new',
      bucket: 'added',
      pass: false,
    });
    const summary = buildSummary([changed, added], ENV);
    const images = new Map([
      [changed.key, { baseline: PNG_BYTES, candidate: PNG_BYTES, diff: PNG_BYTES }],
    ]);

    const html = renderReport(summary, images);

    expect(html).toContain(PNG_DATA_URI);
    expect(html).toMatch(/no baseline/);
    expect(html).toMatch(/no candidate/);
    expect(html).toMatch(/no diff/);
    expect(html).not.toMatch(/<img[^>]*src=""/);
  });

  it('escapes markup in card text instead of emitting it live', () => {
    const summary = buildSummary(
      [changedRow({ id: 'card--<script>alert(1)</script>' })],
      ENV,
    );

    const html = renderReport(summary, new Map());

    expect(html).toContain('<h3>card--&lt;script&gt;alert(1)&lt;/script&gt;</h3>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes the ampersands and quotes an error message can carry', () => {
    const summary = buildSummary(
      [changedRow({ bucket: 'errored', error: 'timeout & "no PNG" <b>' })],
      ENV,
    );

    const html = renderReport(summary, new Map());

    expect(html).toContain(
      '<p class="error">timeout &amp; &quot;no PNG&quot; &lt;b&gt;</p>',
    );
  });

  it('keeps the deep-link globals colon literal and the id percent-encoded', () => {
    const summary = buildSummary(
      [changedRow({ id: 'story id/weird', theme: 'dark' })],
      ENV,
    );

    const html = renderReport(summary, new Map());

    expect(html).toContain('&globals=colorScheme:dark"');
    expect(html).not.toContain('colorScheme%3Adark');
  });
});

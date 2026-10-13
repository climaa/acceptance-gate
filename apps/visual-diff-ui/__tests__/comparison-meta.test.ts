// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import Image from '../app/report/[id]/compare/[key]/opengraph-image';
import { comparisonPath } from '../lib/comparison';
import {
  comparisonCopy,
  comparisonMetadata,
  findComparison,
} from '../lib/comparison-meta';
import { FIXTURES_DIR } from '../lib/data';
import { readPanels } from '../lib/og';
import { NOT_FOUND_TITLE } from '../lib/site';
import { NOT_FOUND } from './stubs/next-navigation';

/**
 * What a comparison says where it is not on screen — a tab, a link preview —
 * read against the committed fixtures, which are the reports a shared link to
 * the deployed console can actually name.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';
const ADDED_REPORT = 'baselines__main-2026-08-24';
const ADDED_KEY = 'atoms__desktop__dark__atoms-iconbutton--ghost';

const metadataFor = (id: string, key: string) =>
  comparisonMetadata(Promise.resolve({ id, key }));

async function found(id: string, key: string) {
  const variant = await findComparison(id, key);
  if (!variant) throw new Error(`fixture ${id}/${key} is gone`);
  return variant;
}

describe('comparisonCopy', () => {
  it('titles the comparison the way the modal heading does', async () => {
    const variant = await found(REPORT, KEY);

    const { title } = comparisonCopy(REPORT, variant);

    expect(title).toBe('Prose — Default · desktop/light');
  });

  it('says how much moved, and in which report', async () => {
    const variant = await found(REPORT, KEY);

    const { description } = comparisonCopy(REPORT, variant);

    expect(description).toMatch(/px differ in the shared area\. Report main-2026/);
  });

  // An added variant has no baseline: a pixel count would describe a shared
  // area that was never measured.
  it('quotes no pixel count where there was nothing to compare', async () => {
    const variant = await found(ADDED_REPORT, ADDED_KEY);

    const { description } = comparisonCopy(ADDED_REPORT, variant);

    expect(description).not.toContain('px');
    expect(description).toContain('added');
  });
});

describe('comparisonMetadata', () => {
  it('points og:url and the canonical at the comparison itself', async () => {
    const metadata = await metadataFor(REPORT, KEY);

    expect(metadata.alternates?.canonical).toBe(comparisonPath(REPORT, KEY));
    expect(metadata.openGraph?.url).toBe(comparisonPath(REPORT, KEY));
  });

  it('asks for the large card, which is what shows the pixels', async () => {
    const metadata = await metadataFor(REPORT, KEY);

    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('titles a miss the way every other miss is titled', async () => {
    const metadata = await metadataFor(REPORT, 'atoms__desktop__light__nope');

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });
});

describe('readPanels', () => {
  it('reads all three shots of a changed variant', async () => {
    const variant = await found(REPORT, KEY);

    const panels = await readPanels(FIXTURES_DIR, REPORT, variant);

    expect(panels.map((panel) => panel.label)).toEqual(['before', 'diff', 'after']);
    for (const { shot } of panels) {
      expect('src' in shot && shot.src.startsWith('data:image/png;base64,')).toBe(true);
    }
  });

  it('says why a panel is empty rather than drawing a blank one', async () => {
    const variant = await found(ADDED_REPORT, ADDED_KEY);

    const [before] = await readPanels(FIXTURES_DIR, ADDED_REPORT, variant);

    expect(before?.shot).toEqual({ absent: 'not on this side' });
  });

  // The summary promises a shot the directory does not hold — a half-copied
  // report. The card says so rather than failing the whole image.
  it('falls back to the absence sentence when a promised shot is missing', async () => {
    const variant = await found(REPORT, KEY);

    const panels = await readPanels(FIXTURES_DIR, REPORT, {
      ...variant,
      key: 'atoms__desktop__light__atoms-never-written--default',
    });

    expect(panels.every(({ shot }) => 'absent' in shot)).toBe(true);
  });
});

describe('the comparison card route', () => {
  it('draws a PNG at the size every unfurler crops to', async () => {
    const response = await Image({ params: Promise.resolve({ id: REPORT, key: KEY }) });

    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  });

  it('is a not-found for a comparison the report does not hold', async () => {
    const draw = Image({ params: Promise.resolve({ id: REPORT, key: 'nope' }) });

    await expect(draw).rejects.toThrow(NOT_FOUND);
  });
});

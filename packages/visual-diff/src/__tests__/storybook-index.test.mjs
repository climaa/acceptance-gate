import { describe, expect, it } from 'vitest';

import {
  ALL_VIEWPORTS_TAG,
  FULLPAGE_TAG,
  SKIP_TAG,
  THEMES,
  VIEWPORTS,
  variantKey,
} from '../policy.mjs';
import { IndexError, planCaptures, readIndex } from '../storybook-index.mjs';

/** A story entry in the shape Storybook 10 writes into `index.json`, minus the fields
 *  the differ never reads. */
const storyEntry = (overrides = {}) => ({
  id: 'atoms-button--primary',
  title: 'Atoms/Button',
  name: 'Primary',
  type: 'story',
  importPath: '../../packages/ui/src/atoms/Button/Button.stories.tsx',
  ...overrides,
});

const templateEntry = (overrides = {}) =>
  storyEntry({
    id: 'templates-postlayout--default',
    title: 'Templates/PostLayout',
    importPath: '../../packages/ui/src/templates/PostLayout/PostLayout.stories.tsx',
    ...overrides,
  });

const indexJson = (...entries) =>
  JSON.stringify({
    v: 5,
    entries: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
  });

/** Every entries-level shape a broken build can produce, none of which the differ may
 *  read as "this Storybook has no stories". */
const emptyIndexes = {
  'no entries key': JSON.stringify({ v: 5 }),
  'a null entries': JSON.stringify({ v: 5, entries: null }),
  'an entries array (the pre-v4 shape)': JSON.stringify({ v: 3, entries: [] }),
  'an empty entries object': JSON.stringify({ v: 5, entries: {} }),
  'a top-level array': JSON.stringify([]),
};

describe('readIndex', () => {
  it('returns one entry per index entry, in index order', () => {
    const json = indexJson(storyEntry(), templateEntry());

    const entries = readIndex(json);

    expect(entries.map((entry) => entry.id)).toEqual([
      'atoms-button--primary',
      'templates-postlayout--default',
    ]);
  });

  it('keeps docs entries — filtering by type is the caller’s job, not the parser’s', () => {
    const json = indexJson(storyEntry({ id: 'atoms-button--docs', type: 'docs' }));

    const entries = readIndex(json);

    expect(entries).toHaveLength(1);
  });

  it('accepts an entry with no tags', () => {
    const json = indexJson(storyEntry());

    const [entry] = readIndex(json);

    expect(entry.tags).toEqual([]);
  });

  it('carries tags through verbatim', () => {
    const json = indexJson(storyEntry({ tags: [SKIP_TAG, 'autodocs'] }));

    const [entry] = readIndex(json);

    expect(entry.tags).toEqual([SKIP_TAG, 'autodocs']);
  });

  it('throws on text that is not JSON', () => {
    const json = 'storybook-static/index.json: 404 Not Found';

    expect(() => readIndex(json)).toThrow(IndexError);
  });

  it('throws when handed something other than the file text', () => {
    const notText = { entries: { 'atoms-button--primary': storyEntry() } };

    expect(() => readIndex(notText)).toThrow(IndexError);
  });

  for (const [shape, json] of Object.entries(emptyIndexes)) {
    it(`throws on ${shape}`, () => {
      expect(() => readIndex(json)).toThrow(IndexError);
    });
  }

  for (const field of ['id', 'title', 'type', 'importPath']) {
    it(`throws when an entry has no ${field}`, () => {
      const entry = storyEntry();
      delete entry[field];
      const json = JSON.stringify({ v: 5, entries: { 'atoms-button--primary': entry } });

      expect(() => readIndex(json)).toThrow(IndexError);
    });
  }

  it('throws when an entry field has the wrong type', () => {
    const json = indexJson(storyEntry({ importPath: 42 }));

    expect(() => readIndex(json)).toThrow(IndexError);
  });

  it('throws when tags is not an array', () => {
    const json = indexJson(storyEntry({ tags: SKIP_TAG }));

    expect(() => readIndex(json)).toThrow(IndexError);
  });

  it('throws when a tag is not a string', () => {
    const json = indexJson(storyEntry({ tags: [{ name: SKIP_TAG }] }));

    expect(() => readIndex(json)).toThrow(IndexError);
  });

  it('names the offending entry, so a broken gate says which story broke it', () => {
    const json = indexJson(storyEntry({ importPath: 42 }));

    expect(() => readIndex(json)).toThrow(/atoms-button--primary/);
  });
});

describe('planCaptures', () => {
  it('expands an atom into one variant per theme at desktop only', () => {
    const entries = readIndex(indexJson(storyEntry()));

    const { variants } = planCaptures(entries);

    expect(variants.map((variant) => variant.key)).toEqual(
      THEMES.map((theme) =>
        variantKey({
          tier: 'atoms',
          viewport: 'desktop',
          theme,
          id: 'atoms-button--primary',
        }),
      ),
    );
  });

  it('expands a template across both viewports and both themes', () => {
    const entries = readIndex(indexJson(templateEntry()));

    const { variants } = planCaptures(entries);

    expect(variants).toHaveLength(Object.keys(VIEWPORTS).length * THEMES.length);
  });

  it('gives every variant a distinct key', () => {
    const entries = readIndex(indexJson(storyEntry(), templateEntry()));

    const { variants } = planCaptures(entries);

    expect(new Set(variants.map((variant) => variant.key)).size).toBe(variants.length);
  });

  it('captures no docs entry', () => {
    const entries = readIndex(
      indexJson(storyEntry(), storyEntry({ id: 'atoms-button--docs', type: 'docs' })),
    );

    const { variants } = planCaptures(entries);

    expect(new Set(variants.map((variant) => variant.id))).toEqual(
      new Set(['atoms-button--primary']),
    );
  });

  it(`widens a tagged ${ALL_VIEWPORTS_TAG} atom to every viewport`, () => {
    const entries = readIndex(indexJson(storyEntry({ tags: [ALL_VIEWPORTS_TAG] })));

    const { variants } = planCaptures(entries);

    expect(new Set(variants.map((variant) => variant.viewport))).toEqual(
      new Set(Object.keys(VIEWPORTS)),
    );
  });

  it('leaves the tier of a widened story alone — the override moves no story', () => {
    const entries = readIndex(indexJson(storyEntry({ tags: [ALL_VIEWPORTS_TAG] })));

    const { variants } = planCaptures(entries);

    for (const variant of variants) {
      expect(variant.tier).toBe('atoms');
    }
  });

  it(`captures no variant of a ${SKIP_TAG} story`, () => {
    const entries = readIndex(
      indexJson(storyEntry({ tags: [SKIP_TAG] }), templateEntry()),
    );

    const { variants } = planCaptures(entries);

    expect(variants.map((variant) => variant.id)).not.toContain('atoms-button--primary');
  });

  it('reports a skipped story rather than hiding it', () => {
    const entries = readIndex(
      indexJson(storyEntry({ tags: [SKIP_TAG] }), templateEntry()),
    );

    const { skipped } = planCaptures(entries);

    expect(skipped).toEqual(['atoms-button--primary']);
  });

  it(`marks every variant of a ${FULLPAGE_TAG} story for a whole-page shot`, () => {
    const entries = readIndex(indexJson(templateEntry({ tags: [FULLPAGE_TAG] })));

    const { variants } = planCaptures(entries);

    expect(variants.every((variant) => variant.fullPage)).toBe(true);
  });

  it('shoots the capture target by default', () => {
    const entries = readIndex(indexJson(templateEntry()));

    const { variants } = planCaptures(entries);

    expect(variants.every((variant) => variant.fullPage)).toBe(false);
  });

  it('throws on a story outside the four tier folders rather than inventing a tier', () => {
    const entries = readIndex(
      indexJson(storyEntry({ importPath: '../src/compositions/Home.stories.tsx' })),
    );

    expect(() => planCaptures(entries)).toThrow(IndexError);
  });

  it('throws on an index whose entries are all docs — a build that produced no stories', () => {
    const entries = readIndex(
      indexJson(storyEntry({ id: 'atoms-button--docs', type: 'docs' })),
    );

    expect(() => planCaptures(entries)).toThrow(IndexError);
  });

  it('does not throw when every story was skipped — a skip is deliberate, not broken', () => {
    const entries = readIndex(indexJson(storyEntry({ tags: [SKIP_TAG] })));

    expect(() => planCaptures(entries)).not.toThrow();
  });
});

// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { shotMetadata } from '../lib/shot-meta';
import { NOT_FOUND_TITLE } from '../lib/site';

const KEY = 'atoms__desktop__light__atoms-badge--accent';

describe('shotMetadata', () => {
  it('titles a shot by its story, viewport and theme, at its own address', async () => {
    const meta = await shotMetadata(
      Promise.resolve({ label: 'main-2026-10-16', key: KEY }),
    );

    expect({ title: meta.title, canonical: meta.alternates?.canonical }).toEqual({
      title: 'Badge — Accent · desktop/light',
      canonical: `/set/main-2026-10-16/shot/${KEY}`,
    });
  });

  it('titles a key that names no variant as a miss', async () => {
    const meta = await shotMetadata(
      Promise.resolve({ label: 'main-2026-10-16', key: 'nope' }),
    );

    expect(meta.title).toBe(NOT_FOUND_TITLE);
  });

  it('titles a label that is not one as a miss', async () => {
    const meta = await shotMetadata(Promise.resolve({ label: '../escape', key: KEY }));

    expect(meta.title).toBe(NOT_FOUND_TITLE);
  });
});

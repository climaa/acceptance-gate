// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { ShotContents } from '../components/ShotContents';
import type { ShotViewProps } from '../components/ShotView';
import { NOT_FOUND } from './stubs/next-navigation';

/**
 * The read behind the shot view, against the committed fixtures — the set a
 * deployed console serves.
 *
 * Asserted on the element it returns rather than rendered, as the comparison's
 * is: what matters is which shot it hands the view, and that a miss never
 * reaches it.
 */

const SET = 'main-2026-08-30';
const KEY = 'atoms__desktop__light__atoms-badge--accent';

const contentsFor = (label: string, key: string) =>
  ShotContents({ params: Promise.resolve({ label, key }), entry: 'direct' });

describe('ShotContents', () => {
  it('hands the view the shot the address names, under its story’s title', async () => {
    const element = await contentsFor(SET, KEY);

    const props = element.props as ShotViewProps;
    expect({
      title: props.title,
      tier: props.tier,
      key: props.shot.key,
      src: props.shot.src,
    }).toEqual({
      title: `Badge — Accent · desktop/light · ${SET}`,
      tier: 'atoms',
      key: KEY,
      src: `/api/sets/${SET}/shots/${KEY}.png`,
    });
  });

  it('captions the shot with its set and its own size', async () => {
    const element = await contentsFor(SET, KEY);

    const { shot } = element.props as ShotViewProps;
    expect(shot.caption).toMatch(new RegExp(`^screenshot · ${SET} · \\d+×\\d+$`));
  });

  // The fixture sets predate the console's ledgers, as most sets on a disk do.
  it('hands the view no readings for a shot with no ledger beside it', async () => {
    const element = await contentsFor(SET, KEY);

    expect((element.props as ShotViewProps).ledger).toBeNull();
  });

  it('is a not-found, never a blank view, for a key the set lacks', async () => {
    const read = contentsFor(SET, 'atoms__desktop__light__atoms-gone--default');

    await expect(read).rejects.toThrow(NOT_FOUND);
  });

  it('is a not-found for a set this instance does not have', async () => {
    const read = contentsFor('never-captured', KEY);

    await expect(read).rejects.toThrow(NOT_FOUND);
  });
});

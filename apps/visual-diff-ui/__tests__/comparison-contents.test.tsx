// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { ComparisonContents } from '../components/ComparisonContents';
import type { ComparisonRouteProps } from '../components/ComparisonRoute';
import { NOT_FOUND } from './stubs/next-navigation';

/**
 * The read behind a comparison's modal, against the committed fixtures — the
 * data a deployed console serves, and so the data every shared link points at.
 *
 * Asserted on the element it returns rather than rendered: what matters here is
 * which variant it hands the modal and that a miss never reaches the modal.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';

const contentsFor = (id: string, key: string) =>
  ComparisonContents({ params: Promise.resolve({ id, key }), entry: 'direct' });

describe('ComparisonContents', () => {
  it('hands the modal the report the address names', async () => {
    const element = await contentsFor(REPORT, KEY);

    const props = element.props as ComparisonRouteProps;
    expect(props.variants.some((variant) => variant.key === KEY)).toBe(true);
    expect(props.sides).toEqual({ a: 'main-2026-08-17', b: 'main-2026-08-13' });
  });

  it('hands the modal only variants it can frame', async () => {
    const element = await contentsFor(REPORT, KEY);

    const { variants } = element.props as ComparisonRouteProps;
    expect(variants.some((variant) => variant.bucket === 'a11y')).toBe(false);
  });

  it('is a not-found, never a blank modal, for a key the report lacks', async () => {
    const read = contentsFor(REPORT, 'atoms__desktop__light__atoms-gone--default');

    await expect(read).rejects.toThrow(NOT_FOUND);
  });

  it('is a not-found for a report this instance does not have', async () => {
    const read = contentsFor('nothing__here', KEY);

    await expect(read).rejects.toThrow(NOT_FOUND);
  });
});

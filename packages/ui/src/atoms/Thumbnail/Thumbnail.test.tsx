import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Thumbnail } from './Thumbnail';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// A 1×1 transparent GIF. Inline, so no test — and no captured story — waits on a
// network the differ's container does not have.
const SRC =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

describe('Thumbnail', () => {
  it('shows the skeleton while the image has not loaded', () => {
    const { container } = render(<Thumbnail src={SRC} alt="baseline" />);

    expect(container.querySelector('.ds-skeleton')).not.toBeNull();
    // The <img> is in the DOM from the first render — it is what fetches, and
    // what fires the `load` that retires the placeholder.
    expect(container.querySelector('.ds-thumbnail__img--pending')).not.toBeNull();
  });

  it('unmounts the skeleton and reveals the image on load', () => {
    const { container } = render(<Thumbnail src={SRC} alt="baseline" />);

    fireEvent.load(screen.getByRole('img', { name: 'baseline' }));

    expect(container.querySelector('.ds-skeleton')).toBeNull();
    expect(container.querySelector('.ds-thumbnail__img--pending')).toBeNull();
    expect(screen.getByRole('img', { name: 'baseline' })).toBeDefined();
  });

  it('renders the fallback and no <img> when there is no src', () => {
    const { container } = render(
      <Thumbnail alt="candidate" fallback={<span>not on this side</span>} />,
    );

    expect(screen.getByText('not on this side')).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
  });

  it('replaces a broken image with the fallback on error', () => {
    const { container } = render(
      <Thumbnail
        src="data:image/gif;base64,!!"
        alt="candidate"
        fallback={<span>not on this side</span>}
      />,
    );

    fireEvent.error(screen.getByRole('img', { name: 'candidate' }));

    expect(screen.getByText('not on this side')).toBeDefined();
    expect(container.querySelector('img')).toBeNull();
    // The skeleton goes with it: nothing is still arriving.
    expect(container.querySelector('.ds-skeleton')).toBeNull();
  });

  it('renders an empty frame rather than a broken image when no fallback is given', () => {
    // Fallback *content* is app vocabulary — this atom must not invent copy of
    // its own to fill the gap.
    const { container } = render(<Thumbnail alt="candidate" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.ds-thumbnail__fallback')?.textContent).toBe('');
  });

  it('returns to the loading state when the src changes', () => {
    const { container, rerender } = render(<Thumbnail src={SRC} alt="baseline" />);

    fireEvent.load(screen.getByRole('img', { name: 'baseline' }));

    rerender(<Thumbnail src={`${SRC}#next`} alt="baseline" />);

    // The previous image's `load` says nothing about the new one; treating it as
    // loaded would show an empty frame until the browser caught up.
    expect(container.querySelector('.ds-skeleton')).not.toBeNull();
  });

  it('appends a caller-supplied className to the frame', () => {
    const { container } = render(
      <Thumbnail src={SRC} alt="baseline" className="u-mt-2" />,
    );

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-thumbnail u-mt-2');
  });
});

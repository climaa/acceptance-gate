import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Thumbnail } from './Thumbnail';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** jsdom never fetches, so an image is never `complete` there. Staging the two
 *  properties the atom reads is how the cached case — the bytes already in hand
 *  before React could attach a listener — is reproduced at all. */
function alreadyLoaded(naturalWidth: number) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(
    naturalWidth,
  );
}

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

  // The regression: an `immutable` route makes a warm cache the ordinary case
  // on a revisit, and a `load` that fired before its handler existed is a load
  // that never arrives — leaving the placeholder up for an image already in
  // hand. The element is asked, not only listened to.
  // This also pins the identity-preserving update inside the ref: an inline ref
  // is re-invoked on every render, so recording a fresh object each time would
  // re-render forever and fail this test with "Too many re-renders".
  it('reveals an image that finished loading before React could listen', () => {
    alreadyLoaded(1);

    const { container } = render(<Thumbnail src={SRC} alt="baseline" />);

    expect(container.querySelector('.ds-skeleton')).toBeNull();
    expect(container.querySelector('.ds-thumbnail__img--pending')).toBeNull();
  });

  // A soft navigation swaps the `src` on a mounted frame, and the new image can
  // be cached too. This is also the one test that fails if the observation is
  // recorded against the element's resolved URL rather than the `src` prop —
  // they never compare equal for a relative src, and the frame would sit on its
  // placeholder forever.
  it('reveals a cached image that arrives as a new src on a mounted frame', () => {
    const { container, rerender } = render(<Thumbnail src={SRC} alt="baseline" />);
    fireEvent.load(screen.getByRole('img', { name: 'baseline' }));
    alreadyLoaded(1);

    rerender(<Thumbnail src={`${SRC}#next`} alt="baseline" />);

    expect(container.querySelector('.ds-skeleton')).toBeNull();
    expect(container.querySelector('.ds-thumbnail__img--pending')).toBeNull();
  });

  // `complete` with no natural width is ambiguous — a failed fetch and an SVG
  // with no intrinsic size look identical from here. Concluding "broken" would
  // remove an image that renders perfectly, and nothing would put it back, so
  // the frame waits for `onError` to say so instead.
  it('does not call an image broken merely for having no intrinsic size', () => {
    alreadyLoaded(0);

    const { container } = render(
      <Thumbnail src={SRC} alt="candidate" fallback={<span>not on this side</span>} />,
    );

    expect(screen.queryByText('not on this side')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });

  // The path the fix actually exists for, driven end to end rather than
  // approximated: server markup, an image the browser finished before any React
  // ran, then hydration. On a client render React attaches `load` before it sets
  // `src`, so the event cannot be missed there — it is hydration where the
  // `<img>` is already in the document and already done. A `useEffect` would run
  // too late to keep the placeholder from painting; this test is what stops one
  // being substituted later.
  it('reveals an image that finished before hydration', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToString(<Thumbnail src={SRC} alt="baseline" />);
    document.body.append(host);
    alreadyLoaded(1);

    act(() => {
      hydrateRoot(host, <Thumbnail src={SRC} alt="baseline" />);
    });

    expect(host.querySelector('.ds-skeleton')).toBeNull();
    expect(host.querySelector('.ds-thumbnail__img--pending')).toBeNull();
  });

  it('appends a caller-supplied className to the frame', () => {
    const { container } = render(
      <Thumbnail src={SRC} alt="baseline" className="u-mt-2" />,
    );

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-thumbnail u-mt-2');
  });

  describe('reserved space', () => {
    it('holds the image ratio before any bytes arrive', () => {
      const { container } = render(
        <Thumbnail src={SRC} alt="baseline" width={1280} height={820} />,
      );

      // The whole point: the frame is this shape while the skeleton is still
      // showing, so nothing under it moves when the image lands.
      const frame = container.firstElementChild as HTMLElement;

      expect(frame.style.aspectRatio).toBe('1280 / 820');
      expect(frame.className).toContain('ds-thumbnail--reserved');
      expect(container.querySelector('.ds-skeleton')).not.toBeNull();
    });

    it('puts the dimensions on the image too', () => {
      const { container } = render(
        <Thumbnail src={SRC} alt="baseline" width={1280} height={820} />,
      );

      const img = container.querySelector('img');

      expect(img?.getAttribute('width')).toBe('1280');
      expect(img?.getAttribute('height')).toBe('820');
    });

    it('reserves nothing when only one dimension is given', () => {
      // One number states no ratio, and guessing the other would reserve the
      // wrong shape — which shifts the page exactly as much as reserving none.
      const { container } = render(<Thumbnail src={SRC} alt="baseline" width={1280} />);

      const frame = container.firstElementChild as HTMLElement;

      expect(frame.style.aspectRatio).toBe('');
      expect(frame.className).not.toContain('ds-thumbnail--reserved');
    });

    it('holds the ratio for the fallback as well', () => {
      // A missing image is the case where a collapsing frame is most visible:
      // the caller knows the shape, so the hole keeps it.
      const { container } = render(
        <Thumbnail alt="missing" fallback="not on this side" width={400} height={300} />,
      );

      expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe(
        '400 / 300',
      );
    });
  });
});

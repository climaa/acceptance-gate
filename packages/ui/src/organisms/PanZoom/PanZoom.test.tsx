import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PanZoom, type PanZoomProps, type View } from './PanZoom';

// `globals` is off in vitest.config.ts, so Testing Library's automatic cleanup
// has no global `afterEach` to hook onto.
afterEach(cleanup);

/**
 * jsdom does no layout: every element measures 0. The pane is given the size a
 * real one would have, and the image its natural size, so the component's own
 * arithmetic — the floor, the cap, the clamp — runs against real numbers.
 */
const PANE = { width: 400, height: 300 };
const NATURAL = { width: 1600, height: 2400 };

const descriptors = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};

beforeAll(() => {
  const paneSize = (side: 'width' | 'height') =>
    function (this: HTMLElement) {
      return this.classList.contains('ds-panzoom__pane') ? PANE[side] : 0;
    };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: paneSize('width'),
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: paneSize('height'),
  });
});

afterAll(() => {
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
  }
});

function renderLoaded(props: Partial<PanZoomProps> = {}) {
  const view = render(
    <PanZoom src="board.png" alt="a design board" label="design board" {...props} />,
  );
  const image = screen.getByRole('img', { name: 'a design board' }) as HTMLImageElement;
  Object.defineProperty(image, 'naturalWidth', { value: NATURAL.width });
  Object.defineProperty(image, 'naturalHeight', { value: NATURAL.height });
  act(() => {
    fireEvent.load(image);
  });

  return { ...view, image };
}

const pane = () => screen.getByRole('group', { name: 'design board' });
const readout = () => screen.getByText(/^\d+%$/).textContent;
const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;

describe('PanZoom', () => {
  it('opens at 100%, the floor, with nothing to zoom out of or reset', () => {
    renderLoaded();

    expect(readout()).toBe('100%');
    expect(button('zoom out').disabled).toBe(true);
    expect(button('reset').disabled).toBe(true);
  });

  it('draws the image as wide as the pane at 100%', () => {
    const { image } = renderLoaded();

    expect(image.style.width).toBe(`${PANE.width}px`);
  });

  it('zooms in a step, and the floor controls come alive', () => {
    renderLoaded();

    fireEvent.click(button('zoom in'));

    expect(readout()).toBe('150%');
    expect(button('zoom out').disabled).toBe(false);
    expect(button('reset').disabled).toBe(false);
  });

  it('clamps a default zoom to the image natural pixels and disables +', () => {
    renderLoaded({ defaultZoom: 100 });

    expect(readout()).toBe('400%');
    expect(button('zoom in').disabled).toBe(true);
  });

  it('resets to 100% at the top-left', () => {
    const { image } = renderLoaded({ defaultZoom: 2 });

    fireEvent.click(button('reset'));

    expect(readout()).toBe('100%');
    expect(image.style.transform).toBe('translate(0px, 0px)');
  });

  // The board at 100% is far taller than the pane, so it pans from the start.
  it('pans down with the arrow key and consumes the key', () => {
    const { image } = renderLoaded();

    const handled = !fireEvent.keyDown(pane(), { key: 'ArrowDown' });

    expect(handled).toBe(true);
    expect(image.style.transform).toBe('translate(0px, -30px)');
  });

  it('leaves a key it does not use to whoever is listening above it', () => {
    renderLoaded();

    const handled = !fireEvent.keyDown(pane(), { key: 'a' });

    expect(handled).toBe(false);
  });

  it('leaves modified arrows alone, so the browser keeps its shortcuts', () => {
    renderLoaded();

    const handled = !fireEvent.keyDown(pane(), { key: 'ArrowDown', metaKey: true });

    expect(handled).toBe(false);
  });

  it('zooms in with + and resets with 0 from the keyboard', () => {
    renderLoaded();

    fireEvent.keyDown(pane(), { key: '+' });
    const zoomed = readout();
    fireEvent.keyDown(pane(), { key: '0' });

    expect(zoomed).toBe('150%');
    expect(readout()).toBe('100%');
  });

  it('zooms out with -', () => {
    renderLoaded({ defaultZoom: 2.25 });

    fireEvent.keyDown(pane(), { key: '-' });

    expect(readout()).toBe('150%');
  });

  it('pans with a drag', () => {
    const { image } = renderLoaded();

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerUp(pane(), { pointerId: 1 });

    expect(image.style.transform).toBe('translate(0px, -80px)');
  });

  it('never drags the image off the pane', () => {
    const { image } = renderLoaded();

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 300, clientY: 400 });

    expect(image.style.transform).toBe('translate(0px, 0px)');
  });

  it('ignores a pointer moving with no drag in progress', () => {
    const { image } = renderLoaded();

    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 0, clientY: -500 });

    expect(image.style.transform).toBe('translate(0px, 0px)');
  });

  it('has no axe violations', async () => {
    const { container } = renderLoaded({ defaultZoom: 2 });

    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});

describe('PanZoom when the image will not load', () => {
  const FALLBACK = 'this board could not be loaded';

  function renderFailed(src = 'missing.png') {
    const view = render(
      <PanZoom src={src} alt="a design board" label="design board" fallback={FALLBACK} />,
    );
    act(() => {
      fireEvent.error(screen.getByRole('img', { name: 'a design board' }));
    });

    return view;
  }

  it('says so in a sentence instead of drawing a broken image', () => {
    renderFailed();

    expect(screen.getByText(FALLBACK)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('disables every zoom control, since there is nothing to move', () => {
    renderFailed();

    const disabled = ['zoom out', 'zoom in', 'reset'].map(
      (name) => button(name).disabled,
    );

    expect(disabled).toEqual([true, true, true]);
  });

  it('recovers when it is pointed at another image', () => {
    const { rerender } = renderFailed();

    rerender(
      <PanZoom
        src="other.png"
        alt="a design board"
        label="design board"
        fallback={FALLBACK}
      />,
    );

    expect(screen.getByRole('img', { name: 'a design board' })).toBeTruthy();
  });
});

describe('PanZoom with a grid', () => {
  const grid = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ds-panzoom__grid');

  it('draws no grid unless asked for', () => {
    const { container } = renderLoaded();

    expect(grid(container)).toBeNull();
    expect(screen.queryByText(/^grid /)).toBeNull();
  });

  // 1600 natural pixels in a 400-pixel pane: 0.25 drawn per pixel, so the
  // finest step 12 screen pixels apart is 64 image pixels, drawn 16 apart.
  it('lays the grid over the image, in the image pixels, and says its step', () => {
    const { container } = renderLoaded({ grid: true });

    expect(screen.getByText('grid 64 px')).toBeTruthy();
    expect(grid(container)?.style.getPropertyValue('--ds-panzoom-grid-gap')).toBe('16px');
  });

  it('follows the zoom: a step in halves the grid it draws', () => {
    renderLoaded({ grid: true, defaultZoom: 2 });

    expect(screen.getByText('grid 32 px')).toBeTruthy();
  });

  it('moves with the image when it pans', () => {
    const { container } = renderLoaded({ grid: true });

    fireEvent.keyDown(pane(), { key: 'ArrowDown' });

    expect(grid(container)?.style.transform).toBe('translate(0px, -30px)');
  });

  it('is decoration only — hidden from the accessibility tree', () => {
    const { container } = renderLoaded({ grid: true });

    expect(grid(container)?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('PanZoom with a lead', () => {
  it('draws the lead on the control row, before the zoom controls', () => {
    const { container } = renderLoaded({ lead: <span>after · main</span> });

    const bar = container.querySelector('.ds-panzoom__bar');
    expect(bar?.firstElementChild?.textContent).toBe('after · main');
    expect(bar?.lastElementChild?.getAttribute('aria-label')).toBe('design board zoom');
  });
});

describe('PanZoom with actions', () => {
  it('draws a caller control among the zoom controls, after reset', () => {
    renderLoaded({ actions: <button type="button">upload</button> });

    const group = screen.getByRole('group', { name: 'design board zoom' });
    const names = within(group)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);

    expect(names).toEqual(['zoom out', 'zoom in', 'reset', 'upload']);
  });
});

describe('PanZoom with marks', () => {
  const layer = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ds-panzoom__marks');
  const marksIn = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('.ds-panzoom__mark'),
  ];
  const MARKS = [
    { x: 400, y: 200, width: 80, height: 40 },
    { x: 800, y: 1200, width: 120, height: 60, emphasis: true },
  ];

  it('draws no layer when handed no marks', () => {
    const { container } = renderLoaded();

    expect(layer(container)).toBeNull();
  });

  it('draws no layer for an empty list of marks', () => {
    const { container } = renderLoaded({ marks: [] });

    expect(layer(container)).toBeNull();
  });

  it('draws one box per mark', () => {
    const { container } = renderLoaded({ marks: MARKS });

    expect(marksIn(container)).toHaveLength(2);
  });

  // 1600 natural pixels in a 400-pixel pane: 0.25 drawn per image pixel.
  it('places a box from the image pixels to the drawn ones', () => {
    const { container } = renderLoaded({ marks: MARKS });

    const { left, top, width, height } = marksIn(container)[0]?.style ?? {};
    expect({ left, top, width, height }).toEqual({
      left: '100px',
      top: '50px',
      width: '20px',
      height: '10px',
    });
  });

  it('follows the zoom: at 200% a box is drawn twice as far and as large', () => {
    const { container } = renderLoaded({ marks: MARKS, defaultZoom: 2 });

    const { left, width } = marksIn(container)[0]?.style ?? {};
    expect({ left, width }).toEqual({ left: '200px', width: '40px' });
  });

  it('moves with the image when it pans', () => {
    const { container } = renderLoaded({ marks: MARKS });

    fireEvent.keyDown(pane(), { key: 'ArrowDown' });

    expect(layer(container)?.style.transform).toBe('translate(0px, -30px)');
  });

  it('sets the emphasized mark apart, and only that one', () => {
    const { container } = renderLoaded({ marks: MARKS });

    const emphasized = marksIn(container).map((mark) =>
      mark.classList.contains('ds-panzoom__mark--emphasis'),
    );
    expect(emphasized).toEqual([false, true]);
  });

  it('is decoration only — hidden from the accessibility tree', () => {
    const { container } = renderLoaded({ marks: MARKS });

    expect(layer(container)?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('PanZoom following a view', () => {
  const VIEW: View = { zoom: 2, x: 0, y: 0.25 };

  // 800 × 1200 drawn at 200%: a quarter of the way down is 300 px.
  it('shows the view it is handed', () => {
    const { image } = renderLoaded({ view: VIEW });

    expect({ readout: readout(), transform: image.style.transform }).toEqual({
      readout: '200%',
      transform: 'translate(0px, -300px)',
    });
  });

  it('reports a step rather than taking it', () => {
    const onViewChange = vi.fn<(view: View) => void>();
    renderLoaded({ view: { zoom: 1, x: 0, y: 0 }, onViewChange });

    fireEvent.click(button('zoom in'));

    expect({
      readout: readout(),
      reported: onViewChange.mock.calls[0]?.[0].zoom,
    }).toEqual({
      readout: '100%',
      reported: 1.5,
    });
  });

  it('reports a drag as a share of the image, clamped as the pane would show it', () => {
    const onViewChange = vi.fn<(view: View) => void>();
    renderLoaded({ view: VIEW, onViewChange });

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 100, clientY: 80 });

    expect(onViewChange.mock.calls.at(-1)?.[0]).toEqual({ zoom: 2, x: 0, y: 0.35 });
  });

  it('reports a reset as the top-left at 100%', () => {
    const onViewChange = vi.fn<(view: View) => void>();
    renderLoaded({ view: VIEW, onViewChange });

    fireEvent.click(button('reset'));

    expect(onViewChange).toHaveBeenCalledWith({ zoom: 1, x: 0, y: 0 });
  });

  // A host that only listens: the pane keeps its own view and says what it is.
  it('reports its own view when it keeps one', () => {
    const onViewChange = vi.fn<(view: View) => void>();
    renderLoaded({ onViewChange });

    fireEvent.keyDown(pane(), { key: '+' });

    expect({
      readout: readout(),
      reported: onViewChange.mock.calls[0]?.[0].zoom,
    }).toEqual({
      readout: '150%',
      reported: 1.5,
    });
  });
});

describe('PanZoom cropping', () => {
  const box = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ds-panzoom__crop');

  it('draws a box while a drag is in progress, and moves nothing', () => {
    const { image, container } = renderLoaded({ cropping: true });

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 200, clientY: 100 });

    const { left, top, width, height } = box(container)?.style ?? {};
    expect({ left, top, width, height, transform: image.style.transform }).toEqual({
      left: '100px',
      top: '50px',
      width: '100px',
      height: '50px',
      transform: 'translate(0px, 0px)',
    });
  });

  // 0.25 drawn pixels per image pixel at 100%.
  it('reports the box in the image own pixels on release, and keeps nothing', () => {
    const onCrop = vi.fn();
    const { container } = renderLoaded({ cropping: true, onCrop });

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(pane(), { pointerId: 1 });

    expect({ reported: onCrop.mock.calls[0]?.[0], box: box(container) }).toEqual({
      reported: { x: 400, y: 200, width: 400, height: 200 },
      box: null,
    });
  });

  it('reports nothing for a click', () => {
    const onCrop = vi.fn();
    renderLoaded({ cropping: true, onCrop });

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerUp(pane(), { pointerId: 1 });

    expect(onCrop).not.toHaveBeenCalled();
  });

  it('drops a crop on Escape, and keeps the key from whoever listens above', () => {
    const onCrop = vi.fn();
    const above = vi.fn();
    const { container } = renderLoaded({ cropping: true, onCrop });
    document.addEventListener('keydown', above);

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.keyDown(pane(), { key: 'Escape' });
    document.removeEventListener('keydown', above);

    expect({ box: box(container), above: above.mock.calls.length }).toEqual({
      box: null,
      above: 0,
    });
  });

  // From the keyboard: Enter starts the middle half of the pane, an arrow moves
  // its far corner by a tenth of the pane, and Enter again reports it.
  it('crops from the keyboard', () => {
    const onCrop = vi.fn();
    renderLoaded({ cropping: true, onCrop });

    fireEvent.keyDown(pane(), { key: 'Enter' });
    fireEvent.keyDown(pane(), { key: 'ArrowRight' });
    fireEvent.keyDown(pane(), { key: 'Enter' });

    expect(onCrop).toHaveBeenCalledWith({ x: 400, y: 300, width: 960, height: 600 });
  });

  it('leaves Escape alone when no crop is being drawn', () => {
    renderLoaded({ cropping: true });

    const handled = !fireEvent.keyDown(pane(), { key: 'Escape' });

    expect(handled).toBe(false);
  });

  it('pans with a drag when it is not cropping, even with a crop to show', () => {
    const { image } = renderLoaded({ crop: { x: 0, y: 0, width: 400, height: 400 } });

    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 100, clientY: 120 });

    expect(image.style.transform).toBe('translate(0px, -80px)');
  });

  it('shows a kept crop where the image now is', () => {
    const { container } = renderLoaded({
      crop: { x: 400, y: 200, width: 400, height: 200 },
      defaultZoom: 2,
    });

    const { left, top, width, height } = box(container)?.style ?? {};
    expect({ left, top, width, height }).toEqual({
      left: '200px',
      top: '100px',
      width: '200px',
      height: '100px',
    });
  });

  it('is decoration only — hidden from the accessibility tree', () => {
    const { container } = renderLoaded({ crop: { x: 0, y: 0, width: 400, height: 400 } });

    expect(box(container)?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('PanZoom cropping, as a host steers it', () => {
  it('drops a crop being drawn when cropping is turned off, and pans again', () => {
    const { image, container, rerender } = renderLoaded({ cropping: true });
    fireEvent.pointerDown(pane(), { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(pane(), { pointerId: 1, clientX: 200, clientY: 100 });

    rerender(<PanZoom src="board.png" alt="a design board" label="design board" />);
    fireEvent.pointerDown(pane(), { pointerId: 2, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(pane(), { pointerId: 2, clientX: 100, clientY: 120 });

    expect({
      box: container.querySelector('.ds-panzoom__crop'),
      transform: image.style.transform,
    }).toEqual({ box: null, transform: 'translate(0px, -80px)' });
  });

  it('tells assistive technology how to crop while cropping is on', () => {
    renderLoaded({ cropping: true });

    expect(pane().getAttribute('aria-describedby')).not.toBeNull();
    expect(
      document.getElementById(pane().getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('press Enter to start one');
  });

  it('says nothing about cropping when it is off', () => {
    renderLoaded();

    expect(pane().getAttribute('aria-describedby')).toBeNull();
  });

  it('has no axe violations while cropping', async () => {
    const { container } = renderLoaded({ cropping: true });

    const results = await axe.run(container);

    expect(results.violations).toEqual([]);
  });
});

describe('PanZoom with an image that loaded before it was listening', () => {
  // Server-rendered markup can finish loading its image before hydration, and
  // React then never sees the load event. The pane must still learn the size.
  it('reads the size off an image already complete when it mounts', () => {
    const proto = HTMLImageElement.prototype;
    const saved = {
      complete: Object.getOwnPropertyDescriptor(proto, 'complete'),
      naturalWidth: Object.getOwnPropertyDescriptor(proto, 'naturalWidth'),
      naturalHeight: Object.getOwnPropertyDescriptor(proto, 'naturalHeight'),
    };
    Object.defineProperty(proto, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(proto, 'naturalWidth', {
      configurable: true,
      get: () => NATURAL.width,
    });
    Object.defineProperty(proto, 'naturalHeight', {
      configurable: true,
      get: () => NATURAL.height,
    });

    try {
      render(<PanZoom src="board.png" alt="a design board" label="design board" />);

      expect(button('zoom in').disabled).toBe(false);
      expect(
        (screen.getByRole('img', { name: 'a design board' }) as HTMLImageElement).style
          .width,
      ).toBe(`${PANE.width}px`);
    } finally {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(proto, key, descriptor);
        else delete (proto as unknown as Record<string, unknown>)[key];
      }
    }
  });
});

describe('PanZoom magnified', () => {
  const image = () => screen.getByRole('img', { name: 'a design board' });

  // 1600 natural pixels in a 400-pixel pane: 400% is the natural size, and a
  // factor of 2 asks for twice that.
  it('zooms past the natural pixels only as far as it is asked to', () => {
    renderLoaded({ defaultZoom: 100, magnify: 2 });

    expect({ readout: readout(), zoomIn: button('zoom in').disabled }).toEqual({
      readout: '800%',
      zoomIn: true,
    });
  });

  it('draws the image pixelated past its natural size', () => {
    renderLoaded({ defaultZoom: 6, magnify: 2 });

    expect(image().classList.contains('ds-panzoom__image--magnified')).toBe(true);
  });

  it('draws it smooth at or under its natural size', () => {
    renderLoaded({ defaultZoom: 4, magnify: 2 });

    expect(image().classList.contains('ds-panzoom__image--magnified')).toBe(false);
  });

  it('keeps the natural cap when asked for nothing', () => {
    renderLoaded({ defaultZoom: 100 });

    expect(readout()).toBe('400%');
  });
});

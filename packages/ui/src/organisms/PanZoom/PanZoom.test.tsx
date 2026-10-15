import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  clampOffset,
  drawnSize,
  fitWidth,
  gridStep,
  PanZoom,
  type PanZoomProps,
  stepZoom,
  zoomAbout,
  zoomCap,
} from './PanZoom';

// `globals` is off in vitest.config.ts, so Testing Library's automatic cleanup
// has no global `afterEach` to hook onto.
afterEach(cleanup);

describe('zoomCap', () => {
  it('is the image at its natural pixels', () => {
    const cap = zoomCap(1600, 400);

    expect(cap).toBe(4);
  });

  it('is 100% for an image no wider than the pane — it is already whole', () => {
    const cap = zoomCap(300, 400);

    expect(cap).toBe(1);
  });

  it('is 100% before the pane has been measured', () => {
    const cap = zoomCap(1600, 0);

    expect(cap).toBe(1);
  });
});

describe('stepZoom', () => {
  it('steps in by 1.5', () => {
    const next = stepZoom(1, 1, 4);

    expect(next).toBe(1.5);
  });

  it('stops at the cap', () => {
    const next = stepZoom(3, 1, 4);

    expect(next).toBe(4);
  });

  it('never steps out below 100%', () => {
    const next = stepZoom(1.2, -1, 4);

    expect(next).toBe(1);
  });

  // 1.5 × 1.5 / 1.5 / 1.5 is 1 only up to floating point: the floor has to be
  // reachable by stepping, or `−` never disables.
  it('lands exactly on the floor after stepping in and back out', () => {
    const next = stepZoom(stepZoom(stepZoom(stepZoom(1, 1, 4), 1, 4), -1, 4), -1, 4);

    expect(next).toBe(1);
  });
});

describe('clampOffset', () => {
  const pane = { width: 400, height: 300 };
  const image = { width: 800, height: 1200 };

  it('never lets the image move right of or below the pane origin', () => {
    const offset = clampOffset({ x: 50, y: 20 }, pane, image);

    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('stops where the image far edge meets the pane far edge', () => {
    const offset = clampOffset({ x: -5000, y: -5000 }, pane, image);

    expect(offset).toEqual({ x: -400, y: -900 });
  });

  it('pins an image shorter than the pane to its top', () => {
    const offset = clampOffset({ x: 0, y: -40 }, pane, { width: 400, height: 100 });

    expect(offset).toEqual({ x: 0, y: 0 });
  });
});

describe('zoomAbout', () => {
  it('keeps the point under the anchor where it was', () => {
    const anchor = { x: 200, y: 150 };

    const offset = zoomAbout({ x: 0, y: 0 }, 1, 2, anchor);

    // The image point under the anchor was (200,150); at 2× it is (400,300),
    // and an offset of (−200,−150) puts it back under the anchor.
    expect(offset).toEqual({ x: -200, y: -150 });
  });
});

describe('gridStep', () => {
  // A 2,642-pixel board fitted to a 681-pixel pane: about 0.26 drawn per pixel.
  it('is coarse over a whole board at 100%', () => {
    const step = gridStep(681 / 2642);

    expect(step).toBe(64);
  });

  it('gets finer as the zoom gets closer', () => {
    const step = gridStep(2);

    expect(step).toBe(8);
  });

  it('never goes finer than 4 image pixels, however close the zoom', () => {
    const step = gridStep(50);

    expect(step).toBe(4);
  });

  it('stops at its coarsest step for an image shrunk past any useful grid', () => {
    const step = gridStep(0.001);

    expect(step).toBe(1024);
  });
});

describe('fitWidth', () => {
  it('is the pane width for an image wider than the pane', () => {
    const width = fitWidth(1600, 400);

    expect(width).toBe(400);
  });

  // A screenshot drawn wider than it was captured is a blurred claim about it.
  it('is the image own width for an image narrower than the pane', () => {
    const width = fitWidth(300, 400);

    expect(width).toBe(300);
  });

  it('is the pane width before the image has reported a size', () => {
    const width = fitWidth(0, 400);

    expect(width).toBe(400);
  });
});

describe('drawnSize', () => {
  it('never stretches a narrow image at 100%', () => {
    const size = drawnSize({ width: 400, height: 300 }, { width: 200, height: 100 }, 1);

    expect(size).toEqual({ width: 200, height: 100 });
  });

  it('is the pane width times the zoom, in the image proportions', () => {
    const size = drawnSize({ width: 400, height: 300 }, { width: 1600, height: 2400 }, 2);

    expect(size).toEqual({ width: 800, height: 1200 });
  });
});

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

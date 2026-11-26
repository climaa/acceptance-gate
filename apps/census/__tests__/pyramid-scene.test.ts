// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bandWidths, type PyramidBand } from '@gate/ui';

/**
 * The home's 3D pyramid: where it sits, what it draws, how it follows the
 * theme, and when it gives up and hands the figure back to the flat one.
 *
 * Declares `jsdom` for itself, as apps/blog/__tests__/error.test.ts does: every
 * claim here is an effect — an observer, a timer, a callback — and an effect
 * runs only when React commits into a document. Every other census suite stays
 * in node.
 *
 * WebGL is not what is under test, and jsdom has none, so `Canvas`,
 * `PerformanceMonitor` and `OrbitControls` are markers that expose the props
 * the scene hands them. Everything inside the canvas — the bands' groups,
 * meshes and geometries — still renders, as plain elements whose attributes
 * are the props three.js would have read.
 */

// React's `act` refuses to flush effects unless the environment declares itself.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fiber = vi.hoisted(() => ({
  invalidate: vi.fn(),
  onDecline: undefined as (() => void) | undefined,
}));

// `vi.mock` is hoisted above the imports, so each factory imports `react` for
// itself rather than closing over the `createElement` bound at the top.
vi.mock('@react-three/fiber', async () => {
  const { createElement: h, useEffect } = await import('react');
  return {
    invalidate: fiber.invalidate,
    Canvas: ({
      children,
      frameloop,
      dpr,
      onCreated,
    }: {
      children: ReactNode;
      frameloop: string;
      dpr: [number, number];
      onCreated: () => void;
    }) => {
      useEffect(() => onCreated(), [onCreated]);
      return h(
        'div',
        { 'data-canvas': '', 'data-frameloop': frameloop, 'data-dpr': dpr.join(',') },
        children,
      );
    },
  };
});

vi.mock('@react-three/drei', async () => {
  const { createElement: h } = await import('react');
  return {
    PerformanceMonitor: ({
      children,
      onDecline,
    }: {
      children: ReactNode;
      onDecline: () => void;
    }) => {
      fiber.onDecline = onDecline;
      return h('div', { 'data-monitor': '' }, children);
    },
    OrbitControls: ({ enabled }: { enabled: boolean }) =>
      h('span', { 'data-controls': '', 'data-enabled': String(enabled) }),
  };
});

const { default: Scene } = await import('@/app/_components/PyramidScene/Scene');

const BANDS: PyramidBand[] = [
  { dimension: 'code', label: 'Code · vitest cases', count: 3550 },
  { dimension: 'visual', label: 'Visual · screenshots', count: 286 },
  { dimension: 'acceptance', label: 'Acceptance · scenarios', count: 88 },
];

/** The world side the widest band spans, as Scene.tsx draws it. */
const SIDE = 2.4;

/** jsdom has no ResizeObserver; this one is fired by hand. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  }) as DOMRect;

let slot: HTMLDivElement;
let host: HTMLDivElement;
let figure: HTMLDivElement | null;
let root: Root;
let withFigure = true;

/** A fresh document slot; `render` fills it with the wrapper PyramidFigure draws. */
function mountWrapper(options: { withFigure?: boolean } = {}) {
  withFigure = options.withFigure ?? true;
  figure = null;
  slot = document.createElement('div');
  document.body.append(slot);
  root = createRoot(slot);
}

/** Refs attach before effects run, so the layout jsdom lacks is in place in time. */
const placeWrapper = (element: HTMLDivElement | null) => {
  if (!element) return;
  host = element;
  element.getBoundingClientRect = () => rect(100, 50, 600, 400);
};
const placeFigure = (element: HTMLDivElement | null) => {
  if (!element) return;
  figure = element;
  element.getBoundingClientRect = () => rect(130, 70, 340, 270);
};

/** The wrapper PyramidFigure renders: the flat figure, then the scene beside it. */
function render(props: Partial<Parameters<typeof Scene>[0]> = {}) {
  const handlers = { onDrawn: vi.fn(), onFallback: vi.fn() };
  act(() => {
    root.render(
      createElement(
        'div',
        { ref: placeWrapper },
        withFigure &&
          createElement('div', {
            className: 'ds-test-pyramid__figure',
            ref: placeFigure,
          }),
        createElement(Scene, { bands: BANDS, still: false, ...handlers, ...props }),
      ),
    );
  });
  return handlers;
}

/** The flat figure is laid out: the observer reports it. */
function resize() {
  act(() => {
    for (const observer of FakeResizeObserver.instances) observer.callback();
  });
}

const scene = () => host.querySelector<HTMLDivElement>('.census-pyramid-scene')!;
const canvas = () => host.querySelector<HTMLElement>('[data-canvas]');
const geometries = () => [...host.querySelectorAll('cylindergeometry')];
const materials = () => [...host.querySelectorAll('meshstandardmaterial')];

beforeEach(() => {
  FakeResizeObserver.instances = [];
  fiber.invalidate.mockClear();
  fiber.onDecline = undefined;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.useFakeTimers();
  document.documentElement.style.setProperty('--color-chart', ' #3366ff ');
  document.documentElement.style.setProperty('--color-chart-2', '#22aa88');
  document.documentElement.style.setProperty('--color-chart-3', '#ee7711');
  // react-dom names three.js's camelCase intrinsics as unknown HTML tags and
  // their boolean props as odd attributes; both are expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  slot.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('where the 3D pyramid sits', () => {
  it('draws nothing until the flat figure it covers has been measured', () => {
    // Arrange
    mountWrapper();

    // Act
    const { onDrawn } = render();

    // Assert
    expect(scene().getAttribute('style')).toBeNull();
    expect(canvas()).toBeNull();
    expect(onDrawn).not.toHaveBeenCalled();
  });

  it('covers exactly the flat figure’s box, relative to the wrapper', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    resize();

    // Assert
    const { style } = scene();
    expect([style.left, style.top, style.width, style.height]).toEqual([
      '30px',
      '20px',
      '340px',
      '270px',
    ]);
    expect(FakeResizeObserver.instances[0]!.observed).toEqual([figure, host]);
  });

  it('stays empty when there is no flat figure beside it to cover', () => {
    // Arrange
    mountWrapper({ withFigure: false });

    // Act
    render();

    // Assert
    expect(FakeResizeObserver.instances).toHaveLength(0);
    expect(canvas()).toBeNull();
  });

  it('stops watching the page’s size once it is gone', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    act(() => root.unmount());
    root = createRoot(slot);

    // Assert
    expect(FakeResizeObserver.instances[0]!.disconnected).toBe(true);
  });

  it('is hidden from assistive technology', () => {
    // Arrange
    mountWrapper();

    // Act
    render();

    // Assert
    expect(scene().getAttribute('aria-hidden')).toBe('true');
  });
});

describe('what the 3D pyramid draws', () => {
  it('tells the figure its first frame is on screen', () => {
    // Arrange
    mountWrapper();
    const { onDrawn } = render();

    // Act
    resize();

    // Assert
    expect(canvas()).not.toBeNull();
    expect(onDrawn).toHaveBeenCalledOnce();
  });

  it('stacks one band per count, base first, each closing to the width of the band above', () => {
    // Arrange
    mountWrapper();
    render();
    const widths = bandWidths(
      BANDS.map((band) => band.count),
      SIDE,
    );

    // Act
    resize();

    // Assert
    const radii = geometries().map((geometry) =>
      geometry.getAttribute('args')!.split(',').map(Number),
    );
    expect(radii).toEqual([
      [widths[1]! / Math.SQRT2, widths[0]! / Math.SQRT2, 0.8, 4],
      [widths[2]! / Math.SQRT2, widths[1]! / Math.SQRT2, 0.8, 4],
      [0, widths[2]! / Math.SQRT2, 0.8, 4],
    ]);
  });

  it('centres the stack on the origin', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    resize();

    // Assert — three bands of 0.8 and two gaps of 0.06 are 2.52 tall.
    const [x, y, z] = host
      .querySelector('group')!
      .getAttribute('position')!
      .split(',')
      .map(Number);
    expect([x, z]).toEqual([0, 0]);
    expect(y).toBeCloseTo(-1.26);
  });

  it('draws an empty census as an empty stack', () => {
    // Arrange
    mountWrapper();
    render({ bands: [] });

    // Act
    resize();

    // Assert
    expect(geometries()).toHaveLength(0);
    expect(host.querySelector('group')!.getAttribute('position')).toBe('0,0,0');
  });

  it('fills each band with its dimension’s design token', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    resize();

    // Assert
    expect(materials().map((material) => material.getAttribute('color'))).toEqual([
      '#3366ff',
      '#22aa88',
      '#ee7711',
    ]);
  });

  it('follows a theme switch and asks for a fresh frame', async () => {
    // Arrange
    mountWrapper();
    render();
    resize();
    document.documentElement.style.setProperty('--color-chart', '#000000');

    // Act
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });

    // Assert
    expect(materials()[0]!.getAttribute('color')).toBe('#000000');
    expect(fiber.invalidate).toHaveBeenCalledOnce();
  });
});

describe('how the 3D pyramid moves', () => {
  it('can be dragged', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    resize();

    // Assert
    expect(scene().className).toBe('census-pyramid-scene');
    expect(host.querySelector('[data-controls]')!.getAttribute('data-enabled')).toBe(
      'true',
    );
  });

  it('holds still under reduced motion', () => {
    // Arrange
    mountWrapper();
    render({ still: true });

    // Act
    resize();

    // Assert
    expect(scene().className).toBe('census-pyramid-scene census-pyramid-scene--still');
    expect(host.querySelector('[data-controls]')!.getAttribute('data-enabled')).toBe(
      'false',
    );
  });

  it('renders every frame while its first seconds are sampled, then only on demand', () => {
    // Arrange
    mountWrapper();
    render();
    resize();
    const before = canvas()!.dataset.frameloop;

    // Act
    act(() => vi.advanceTimersByTime(7_500));

    // Assert
    expect(before).toBe('always');
    expect(canvas()!.dataset.frameloop).toBe('demand');
  });
});

describe('when the frame rate declines', () => {
  it('starts at the display’s full resolution', () => {
    // Arrange
    mountWrapper();
    render();

    // Act
    resize();

    // Assert
    expect(canvas()!.dataset.dpr).toBe('1,2');
  });

  it('lowers the resolution on the first decline and keeps the scene', () => {
    // Arrange
    mountWrapper();
    const { onFallback } = render();
    resize();

    // Act
    act(() => fiber.onDecline!());

    // Assert
    expect(canvas()!.dataset.dpr).toBe('1,1');
    expect(onFallback).not.toHaveBeenCalled();
  });

  it('hands the figure back to the flat one on the second', () => {
    // Arrange
    mountWrapper();
    const { onFallback } = render();
    resize();
    act(() => fiber.onDecline!());

    // Act
    act(() => fiber.onDecline!());

    // Assert
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('ignores a decline once sampling is over: on-demand pauses are not a slow GPU', () => {
    // Arrange
    mountWrapper();
    const { onFallback } = render();
    resize();
    act(() => vi.advanceTimersByTime(7_500));

    // Act
    act(() => {
      fiber.onDecline!();
      fiber.onDecline!();
    });

    // Assert
    expect(canvas()!.dataset.dpr).toBe('1,2');
    expect(onFallback).not.toHaveBeenCalled();
  });
});

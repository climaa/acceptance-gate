// @vitest-environment jsdom
//
// jsdom rather than the suite's node default: the component's output only exists
// once React has mounted it and its effect has run. `mermaid` itself is swapped for
// a recorder whose `render` hands back a promise the test settles by hand — the
// real library needs a layout engine jsdom does not have, and what this suite
// asserts is what the component does with mermaid's answer, not how mermaid draws.
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mermaid } from '../src/docs/Mermaid';

/**
 * The Mermaid block is how a docs page gets a diagram at all: Storybook's MDX has
 * no build-time Mermaid, so a fenced block would render as a code sample. The
 * failures this guards are quiet ones — a diagram drawn with dark fills under dark
 * text, two diagrams on one page fighting over one id, or a stale render landing
 * after the chart already changed.
 */

interface PendingRender {
  id: string;
  chart: string;
  resolve: (svg: string) => void;
}

const mermaidMock = vi.hoisted(() => ({
  initialized: [] as unknown[],
  pending: [] as PendingRender[],
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: (config: unknown) => {
      mermaidMock.initialized.push(config);
    },
    render: (id: string, chart: string) =>
      new Promise<{ svg: string }>((resolve) => {
        mermaidMock.pending.push({ id, chart, resolve: (svg) => resolve({ svg }) });
      }),
  },
}));

let container: HTMLDivElement;
let root: Root;

const element = (chart: string) => createElement(Mermaid, { chart }) as ReactElement;

const mount = (node: ReactElement) => {
  act(() => {
    root.render(node);
  });
};

/** Settles one pending `mermaid.render` call and lets React apply the result. */
const settle = async (render: PendingRender | undefined, svg: string) => {
  await act(async () => {
    render?.resolve(svg);
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mermaidMock.pending = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('loading the module', () => {
  it('configures mermaid once for the light docs chrome, strict, and never auto-run', () => {
    expect(mermaidMock.initialized).toEqual([
      { startOnLoad: false, theme: 'neutral', securityLevel: 'strict' },
    ]);
  });
});

describe('a diagram on a docs page', () => {
  it('renders nothing until mermaid has produced the SVG', () => {
    mount(element('graph TD; A-->B'));

    expect(container.innerHTML).toBe('');
  });

  it('hands mermaid the chart source as written', () => {
    mount(element('graph TD; A-->B'));

    expect(mermaidMock.pending.map((render) => render.chart)).toEqual([
      'graph TD; A-->B',
    ]);
  });

  it('shows the SVG mermaid returned, inline', async () => {
    mount(element('graph TD; A-->B'));

    await settle(mermaidMock.pending[0], '<svg id="drawn"></svg>');

    expect(container.querySelector('div > svg#drawn')).not.toBeNull();
  });

  it('renders under a mermaid- id with no colons in it', () => {
    mount(element('graph TD; A-->B'));

    expect(mermaidMock.pending[0]?.id).toMatch(/^mermaid-[^:]+$/);
  });
});

describe('two diagrams on the same page', () => {
  it('render under different ids, so mermaid keeps them apart', () => {
    mount(
      createElement('div', null, element('graph TD; A-->B'), element('graph TD; C-->D')),
    );

    const ids = mermaidMock.pending.map((render) => render.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('a chart that changes', () => {
  it('is rendered again from the new source', async () => {
    mount(element('graph TD; A-->B'));
    await settle(mermaidMock.pending[0], '<svg id="first"></svg>');

    mount(element('graph TD; C-->D'));
    await settle(mermaidMock.pending[1], '<svg id="second"></svg>');

    expect({
      charts: mermaidMock.pending.map((render) => render.chart),
      shown: container.querySelector('svg')?.id,
    }).toEqual({ charts: ['graph TD; A-->B', 'graph TD; C-->D'], shown: 'second' });
  });

  it('never shows the old render when it lands after the new one', async () => {
    mount(element('graph TD; A-->B'));
    mount(element('graph TD; C-->D'));
    const [stale, fresh] = mermaidMock.pending;

    await settle(fresh, '<svg id="fresh"></svg>');
    await settle(stale, '<svg id="stale"></svg>');

    expect(container.querySelector('svg')?.id).toBe('fresh');
  });
});

describe('leaving the docs page', () => {
  it('drops a render that lands after unmounting', async () => {
    mount(element('graph TD; A-->B'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => root.unmount());
    await settle(mermaidMock.pending[0], '<svg id="late"></svg>');

    expect({ html: container.innerHTML, errors: errors.mock.calls }).toEqual({
      html: '',
      errors: [],
    });
    errors.mockRestore();
    root = createRoot(container);
  });
});

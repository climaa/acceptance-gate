// @vitest-environment jsdom
//
// jsdom rather than the suite's node default: the container's whole job is to
// write `data-theme` onto <html> and hand addon-docs a theme, and both only exist
// once React has actually mounted it. addon-docs's own `DocsContainer` is swapped
// for a recorder — rendering the real one needs a full docs context, and what this
// suite asserts is the `theme` it is handed, not how addon-docs paints with it.
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GLOBALS_UPDATED, SET_GLOBALS } from 'storybook/internal/core-events';
import { themes } from 'storybook/theming';
import type { DocsContainerProps } from '@storybook/addon-docs/blocks';
import { COLOR_SCHEME_GLOBAL } from '@gate/visual-diff/policy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemedDocsContainer } from '../.storybook/ThemedDocsContainer';

/**
 * The docs container is the only thing that makes the toolbar's Theme toggle reach
 * a pure-MDX docs page: no `<Story>` renders there, so the preview's theme
 * decorator never runs. It reads the global straight off the preview channel —
 * the value already fired at boot, then every later change — and the failure this
 * guards is silent: miss the boot event and every docs page opened on a dark URL
 * renders light, with nothing erroring.
 */

const received = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock('@storybook/addon-docs/blocks', () => ({
  DocsContainer: (props: Record<string, unknown>) => {
    received.props.push(props);
    return null;
  },
}));

type Listener = (payload: unknown) => void;

/** The three channel methods the container calls, with `last` answering the way
 *  Storybook's does: the args of the most recent emit, as an array, or undefined
 *  when the event never fired. */
class FakeChannel {
  private readonly lastArgs = new Map<string, unknown[]>();
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(fired: Record<string, unknown> = {}) {
    for (const [event, payload] of Object.entries(fired)) {
      this.lastArgs.set(event, [payload]);
    }
  }

  last(event: string): unknown[] | undefined {
    return this.lastArgs.get(event);
  }

  on(event: string, listener: Listener): void {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: unknown): void {
    this.lastArgs.set(event, [payload]);
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  listenerCount(): number {
    let count = 0;
    for (const set of this.listeners.values()) count += set.size;
    return count;
  }
}

const globals = (colorScheme: unknown) => ({
  globals: { [COLOR_SCHEME_GLOBAL]: colorScheme },
});

/** The theme addon-docs was handed on the latest render. */
const lastTheme = () => received.props.at(-1)?.theme;

let container: HTMLDivElement;
let root: Root;

const mount = (channel: FakeChannel, extra: Record<string, unknown> = {}) => {
  const props = { context: { channel }, ...extra } as unknown as DocsContainerProps;
  act(() => {
    root.render(createElement(ThemedDocsContainer, props) as ReactElement);
  });
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  received.props = [];
  delete document.documentElement.dataset.theme;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the theme a docs page opens on', () => {
  it('is the one already fired at boot, so a dark URL renders dark', () => {
    const channel = new FakeChannel({ [SET_GLOBALS]: globals('dark') });

    mount(channel);

    expect({ attr: document.documentElement.dataset.theme, theme: lastTheme() }).toEqual({
      attr: 'dark',
      theme: themes.dark,
    });
  });

  it('prefers the latest toolbar change over the boot value', () => {
    const channel = new FakeChannel({
      [SET_GLOBALS]: globals('light'),
      [GLOBALS_UPDATED]: globals('dark'),
    });

    mount(channel);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to the boot value when the latest change carries no theme', () => {
    const channel = new FakeChannel({
      [SET_GLOBALS]: globals('dark'),
      [GLOBALS_UPDATED]: { globals: {} },
    });

    mount(channel);

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('is light with no attribute when no globals event has fired yet', () => {
    const channel = new FakeChannel();

    mount(channel);

    expect({ attr: document.documentElement.dataset.theme, theme: lastTheme() }).toEqual({
      attr: undefined,
      theme: themes.light,
    });
  });

  it('ignores a theme global that is not a string', () => {
    const channel = new FakeChannel({ [SET_GLOBALS]: globals(42) });

    mount(channel);

    expect({ attr: document.documentElement.dataset.theme, theme: lastTheme() }).toEqual({
      attr: undefined,
      theme: themes.light,
    });
  });
});

describe('a toolbar change on an open docs page', () => {
  it('switches the page and addon-docs to the new theme', () => {
    const channel = new FakeChannel();
    mount(channel);

    act(() => channel.emit(GLOBALS_UPDATED, globals('dark')));

    expect({ attr: document.documentElement.dataset.theme, theme: lastTheme() }).toEqual({
      attr: 'dark',
      theme: themes.dark,
    });
  });

  it('clears the attribute again on the way back to light', () => {
    const channel = new FakeChannel({ [SET_GLOBALS]: globals('dark') });
    mount(channel);

    act(() => channel.emit(GLOBALS_UPDATED, globals('light')));

    expect({ attr: document.documentElement.dataset.theme, theme: lastTheme() }).toEqual({
      attr: undefined,
      theme: themes.light,
    });
  });

  it('keeps the current theme when another global changed instead', () => {
    const channel = new FakeChannel({ [SET_GLOBALS]: globals('dark') });
    mount(channel);

    act(() => channel.emit(GLOBALS_UPDATED, { globals: { locale: 'es' } }));

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('also follows a later SET_GLOBALS', () => {
    const channel = new FakeChannel();
    mount(channel);

    act(() => channel.emit(SET_GLOBALS, globals('dark')));

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('leaving the docs page', () => {
  it('stops listening to the channel', () => {
    const channel = new FakeChannel();
    mount(channel);

    act(() => root.unmount());

    expect(channel.listenerCount()).toBe(0);
    root = createRoot(container);
  });
});

describe('what addon-docs is handed', () => {
  it('is the same context and every other prop, untouched', () => {
    const channel = new FakeChannel();

    mount(channel, { children: 'page' });

    expect({
      channel: (received.props.at(-1)?.context as { channel: unknown }).channel,
      children: received.props.at(-1)?.children,
    }).toEqual({ channel, children: 'page' });
  });
});

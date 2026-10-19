import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPT_OUT_KEY, optOutBeforeSend } from './analytics';

/**
 * The owner's opt-out. Node has no `localStorage` of its own here, so each case
 * stubs one onto `globalThis` — the same place a browser keeps it, and the only
 * place the function looks.
 */

/** A `localStorage` that is a Map underneath, starting from `seed`. */
const fakeStorage = (seed: Record<string, string> = {}) => {
  const items = new Map(Object.entries(seed));

  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
};

const pageview = (url: string) => ({ type: 'pageview' as const, url });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a browser that has not opted out', () => {
  it('sends the event untouched', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const event = pageview('https://blog.example/blog/post');

    const sent = optOutBeforeSend(event);

    expect(sent).toBe(event);
  });
});

describe('a browser that has opted out', () => {
  // The vendor's documented pattern, and the flag a DevTools user sets by hand.
  it('sends nothing', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [OPT_OUT_KEY]: '1' }));

    const sent = optOutBeforeSend(pageview('https://blog.example/'));

    expect(sent).toBeNull();
  });

  // The flag's presence is the switch, not its value — a hand-set `true` counts.
  it('honours any value a hand-set flag holds', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [OPT_OUT_KEY]: 'true' }));

    const sent = optOutBeforeSend(pageview('https://blog.example/'));

    expect(sent).toBeNull();
  });
});

describe('the parameter', () => {
  it('opts this browser out, starting with the visit that carries it', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);

    const sent = optOutBeforeSend(pageview('https://blog.example/?va-disable=1'));

    expect(sent).toBeNull();
    expect(storage.items.get(OPT_OUT_KEY)).toBe('1');
  });

  it('stays opted out on the next visit, which carries no parameter', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    optOutBeforeSend(pageview('https://blog.example/?va-disable=1'));

    const sent = optOutBeforeSend(pageview('https://blog.example/blog'));

    expect(sent).toBeNull();
  });

  it('opts back in with 0, and reports that visit without the parameter', () => {
    const storage = fakeStorage({ [OPT_OUT_KEY]: '1' });
    vi.stubGlobal('localStorage', storage);

    const sent = optOutBeforeSend(
      pageview('https://blog.example/blog?va-disable=0&page=2'),
    );

    expect(sent?.url).toBe('https://blog.example/blog?page=2');
    expect(storage.items.has(OPT_OUT_KEY)).toBe(false);
  });

  it('keeps every other field of the event', () => {
    vi.stubGlobal('localStorage', fakeStorage());

    const sent = optOutBeforeSend({
      type: 'event',
      url: 'https://x.example/?va-disable=0',
      id: 7,
    });

    expect(sent).toEqual({ type: 'event', url: 'https://x.example/', id: 7 });
  });
});

describe('when it cannot decide', () => {
  // A sandboxed iframe, blocked site data — and plain Node.
  it('sends the event when there is no localStorage', () => {
    const event = pageview('https://blog.example/?va-disable=1');

    const sent = optOutBeforeSend(event);

    expect(sent).toBe(event);
  });

  it('sends the event when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    });
    const event = pageview('https://blog.example/');

    const sent = optOutBeforeSend(event);

    expect(sent).toBe(event);
  });

  it('sends the event when its URL does not parse', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [OPT_OUT_KEY]: '1' }));
    const event = pageview('not a url');

    const sent = optOutBeforeSend(event);

    expect(sent).toBe(event);
  });
});

/**
 * apps/storybook ships this function as source text. A reference to anything
 * outside its own body — the module constant above, an import — would be a
 * ReferenceError swallowed by its own catch: the opt-out would silently stop
 * working. Rebuilt in an empty scope, it has to behave exactly the same.
 */
describe('the function as source text', () => {
  it('opts out from an empty scope', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const rebuilt = new Function(
      `return (${optOutBeforeSend.toString()});`,
    )() as typeof optOutBeforeSend;

    const sent = rebuilt(pageview('https://sb.example/?path=/docs/a--docs&va-disable=1'));

    expect(sent).toBeNull();
  });

  it('never contains the characters that would close its script tag', () => {
    const source = optOutBeforeSend.toString();

    expect(source.toLowerCase()).not.toContain('</script');
  });
});

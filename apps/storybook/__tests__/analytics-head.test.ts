// @vitest-environment jsdom
//
// jsdom rather than the suite's node default, for one reason: the subject emits
// HTML, so every assertion below reads it through a real HTML parser instead of
// grepping the string. A substring match would pass happily on
// `src="/x" onload="alert(1)"` — only a parser can tell an attribute value from
// a new attribute, which is the whole question this file exists to answer.
// jsdom never executes a <script> inserted through innerHTML, so parsing is inert.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyticsHead, rewriteAnalyticsUrl } from '../.storybook/analytics-head';
import config from '../.storybook/main';

/**
 * Two claims, and the file is organised around which one a case makes.
 *
 * The first is the gate and the escaping: who gets a beacon, which loader they
 * get, and that no value out of the injected config can become markup. Those
 * cases take a plain object, because the function does — no `process.env` is
 * involved in any of them, and stubbing one would only describe a call the
 * subject never makes.
 *
 * The second is that the copy of `beforeSend` which actually ships behaves like
 * the one this file can import. It is inlined through `.toString()`, so the
 * shipped artifact is a *string* that has since been through esbuild's type
 * strip and an HTML parse. `queuedBeforeSend` recovers it from the far side of
 * both and runs it through the same table as the binding.
 */

/** The snippet parsed as head content — the context the manager template puts it
 *  in, which interpolates with `<%- head %>`: raw, unescaped, ours to get right. */
const parseHead = (html: string) => {
  const doc = document.implementation.createHTMLDocument();

  doc.head.innerHTML = html;

  return doc.head;
};

/**
 * The inline script as the browser will see it: read back out of a parse, never
 * sliced off the emitted string. That is load-bearing. If the text ever
 * terminated its own element early — a `</script` inside the inlined function,
 * an unescaped config value — this returns the truncated half, and every case
 * built on it fails on a SyntaxError instead of passing.
 */
const inlineScriptOf = (html: string) =>
  parseHead(html).querySelector('script:not([src])')?.textContent ?? '';

const loaderOf = (html: string) => parseHead(html).querySelector('script[src]');

const production = (VERCEL_OBSERVABILITY_CLIENT_CONFIG?: string) => ({
  VERCEL_ENV: 'production',
  VERCEL_OBSERVABILITY_CLIENT_CONFIG,
});

const configured = (analytics: Record<string, unknown>) =>
  production(JSON.stringify({ analytics }));

/** The preset signature, narrowed to what these cases supply — Storybook's own
 *  second argument is its full `Options`, some forty fields none of this reads.
 *  Narrowed the way preview.test.ts narrows its decorators, and guarded by the
 *  `typeof` case below so the cast cannot cover for a change of shape. */
type ManagerHead = (head: string | undefined) => string | undefined;

const callManagerHead = (head: string | undefined) =>
  (config.managerHead as unknown as ManagerHead)(head) ?? '';

type QueueWindow = { va?: (...args: unknown[]) => void; vaq?: unknown[][] };

/** Runs the emitted inline script against a stand-in `window`. `new Function`
 *  gives it a scope of exactly that one binding, then the globals — nothing
 *  from this module is reachable from inside. */
const runInlineScript = (html: string): QueueWindow => {
  const win: QueueWindow = {};

  new Function('window', inlineScriptOf(html))(win);

  return win;
};

/**
 * The shipped `beforeSend`, recovered off the queue it registered into.
 *
 * A `rewriteAnalyticsUrl` that ever grew a reference to an import or a module
 * constant fails here, in CI, rather than in a reader's browser where the only
 * symptom is a beacon that silently stopped arriving.
 */
const queuedBeforeSend = (html: string) =>
  (runInlineScript(html).vaq?.[0]?.[1] ?? null) as
    ((event: { url: string }) => { url: string }) | null;

describe('the gate', () => {
  it('installs a queue and exactly one deferred loader on a production deployment', () => {
    const head = analyticsHead(production());

    const parsed = parseHead(head);

    // Two tags and no more: the stub, then the loader. A third would mean
    // something in the emitted text had been parsed as markup.
    expect(parsed.querySelectorAll('script')).toHaveLength(2);
    // Deferred, not async: the stub above it has to have run first, and `defer`
    // is what the vendor sets.
    expect(parsed.querySelector('script[src]')?.hasAttribute('defer')).toBe(true);
  });

  // The case the gate exists for. Every preview of this Storybook sits behind
  // Vercel auth, so a view it could report is a reviewer or a machine, landing
  // in the same dataset as the published one where it reads as a reader.
  it.each(['preview', 'development'])('stays out of a %s deployment', (VERCEL_ENV) => {
    const head = analyticsHead({ VERCEL_ENV });

    expect(head).toBe('');
  });

  // Asserted rather than left ambient: `storybook build` runs locally and in CI
  // with no deployment environment at all, and an empty string that happens to
  // be empty because nothing was set is not a result.
  it('stays out of a build with no deployment environment', () => {
    const head = analyticsHead({});

    expect(head).toBe('');
  });
});

describe('the loader the injected config chooses', () => {
  it('takes the scriptSrc and both endpoints the platform supplies', () => {
    const head = analyticsHead(
      configured({
        scriptSrc: '/proxy/insights/script.js',
        viewEndpoint: '/proxy/view',
        eventEndpoint: '/proxy/event',
      }),
    );

    const loader = loaderOf(head);

    expect(loader?.getAttribute('src')).toBe('/proxy/insights/script.js');
    expect(loader?.getAttribute('data-view-endpoint')).toBe('/proxy/view');
    expect(loader?.getAttribute('data-event-endpoint')).toBe('/proxy/event');
  });

  it('omits an endpoint the platform did not supply', () => {
    const head = analyticsHead(configured({ scriptSrc: '/proxy/script.js' }));

    const loader = loaderOf(head);

    expect(loader?.hasAttribute('data-view-endpoint')).toBe(false);
  });

  it.each([
    ['a bare path', 'insights/script.js', '/insights/script.js'],
    ['a rooted path', '/insights/script.js', '/insights/script.js'],
    ['an absolute URL', 'https://cdn.example.com/s.js', 'https://cdn.example.com/s.js'],
  ])('resolves %s to %s', (_name, scriptSrc, expected) => {
    const head = analyticsHead(configured({ scriptSrc }));

    expect(loaderOf(head)?.getAttribute('src')).toBe(expected);
  });

  // Every one of these would throw, or stringify garbage into the tag, if the
  // parse were trusted. A throw here is not a missing beacon — it is a failed
  // `storybook build`, so no deployment at all, over a variable this app never
  // declared and cannot see the value of.
  it.each([
    ['not JSON at all', '{not json'],
    ['JSON that is not an object', '"a string"'],
    ['an object with no analytics block', '{"speedInsights":{}}'],
    ['an analytics block that is not an object', '{"analytics":42}'],
    ['a scriptSrc that is not a string', '{"analytics":{"scriptSrc":7}}'],
  ])('falls back to the platform default given %s', (_name, raw) => {
    const head = analyticsHead(production(raw));

    expect(loaderOf(head)?.getAttribute('src')).toBe('/_vercel/insights/script.js');
  });

  // Why this module escapes for HTML rather than reaching for JSON.stringify:
  // `JSON.stringify('a"b')` is `"a\"b"`, and pasted into an attribute the HTML
  // tokenizer ends the value at the backslash-quote and reads the rest as
  // attributes. The third assertion is the real one — after a parse round-trip
  // the value comes back identical, which is only true if it was escaped rather
  // than truncated.
  it.each([
    ['an attribute break-out', '/x" onload="alert(1)'],
    ['an element break-out', '/x"></script><script>alert(1)</script><script src="'],
  ])('cannot be escaped from by %s', (_name, scriptSrc) => {
    const head = analyticsHead(configured({ scriptSrc }));

    const parsed = parseHead(head);

    expect(parsed.querySelectorAll('script')).toHaveLength(2);
    expect(parsed.querySelector('script[src]')?.hasAttribute('onload')).toBe(false);
    expect(parsed.querySelector('script[src]')?.getAttribute('src')).toBe(scriptSrc);
  });
});

/**
 * Why a rewrite at all: every URL this Storybook has is
 * `/index.html?path=/docs/x--docs` — vercel.json redirects `/` there — so
 * untouched, the Vercel Pages panel reports the whole site as one row.
 */
const REWRITES = [
  {
    name: 'a docs page becomes its own row',
    url: 'https://sb.example.com/index.html?path=/docs/docs-welcome--docs',
    expected: 'https://sb.example.com/docs/docs-welcome--docs',
  },
  {
    name: 'manager state alongside the path is dropped, not made a second row',
    url: 'https://sb.example.com/index.html?path=/docs/x--docs&globals=theme:dark',
    expected: 'https://sb.example.com/docs/x--docs',
  },
  {
    name: 'a URL with no path param is not ours to rename',
    url: 'https://sb.example.com/iframe.html?id=atoms-badge--default',
    expected: 'https://sb.example.com/iframe.html?id=atoms-badge--default',
  },
  {
    name: 'a url the URL parser rejects is passed through rather than thrown on',
    url: 'not-a-url',
    expected: 'not-a-url',
  },
] as const;

describe('the url the beacon reports', () => {
  it.each(REWRITES)('$name', ({ url, expected }) => {
    const rewritten = rewriteAnalyticsUrl({ url });

    expect(rewritten.url).toBe(expected);
  });

  // The rest of the event is the loader's, not ours — dropping `type` would
  // turn a page view into an unclassifiable one.
  it('leaves every field but the url alone', () => {
    const rewritten = rewriteAnalyticsUrl({
      type: 'pageview',
      url: 'https://sb.example.com/index.html?path=/docs/x--docs',
    });

    expect(rewritten.type).toBe('pageview');
  });
});

/**
 * The same table, against the copy that ships.
 *
 * These are not duplicates of the block above. That one exercises a TypeScript
 * binding; this one exercises a string — the one `.toString()` produced after
 * esbuild stripped the types, after it was concatenated into markup, and after
 * an HTML parser read it back. Anything that breaks between those two (a
 * closure over a module constant, a `</script` in the source, a coverage
 * instrumenter rewriting the body) is invisible above and fails here.
 */
describe('the inlined copy of that rewrite', () => {
  const head = analyticsHead(production());

  it('is what the queue hands the loader', () => {
    const win = runInlineScript(head);

    expect(win.vaq?.[0]?.[0]).toBe('beforeSend');
  });

  // The stub's whole job: the loader is deferred, so everything the manager does
  // before it arrives has to survive somewhere.
  it('buffers calls that arrive before the loader does', () => {
    const win = runInlineScript(head);

    win.va?.('event', { name: 'anything' });

    expect(win.vaq).toHaveLength(2);
  });

  it.each(REWRITES)('$name, identically', ({ url, expected }) => {
    const rewritten = queuedBeforeSend(head)?.({ url });

    expect(rewritten?.url).toBe(expected);
  });
});

describe('the wiring in main.ts', () => {
  // The only place `process.env` is genuinely in play: main.ts reads it at call
  // time, so these cases have to move the real one.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is a preset function rather than a fixed string', () => {
    // The cast below is what lets the rest of this block call it. This case is
    // what stops the cast from quietly covering for a field that stopped being
    // a function: Storybook's type admits a bare string too, and that shape
    // would ignore `analyticsHead` entirely while still type-checking.
    expect(typeof config.managerHead).toBe('function');
  });

  it('appends to the head Storybook already built rather than replacing it', () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const head = callManagerHead('<meta name="sentinel" />');

    // Both halves: the modulepreloads and favicon links the template put there
    // are load-bearing, and so is the snippet.
    expect(parseHead(head).querySelector('meta[name="sentinel"]')).not.toBeNull();
    expect(parseHead(head).querySelectorAll('script')).toHaveLength(2);
  });

  it('leaves the head untouched on a preview deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const head = callManagerHead('<meta name="sentinel" />');

    expect(head).toBe('<meta name="sentinel" />');
  });

  // The preset signature types the accumulated head as optional, so a bare
  // template literal would type-check and then write the word "undefined" into
  // the manager's <head> — visible on the page, and only there.
  it('writes nothing at all when Storybook passes no accumulated head', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const head = callManagerHead(undefined);

    expect(head).toBe('');
  });

  /**
   * Negative space, and not a config echo: `previewHead`/`previewBody` reach
   * `iframe.html`, which is loaded once per story render, per docs page, per
   * theme, and once more for every shot the differ takes — `capture.mjs`
   * navigates it directly. A beacon there would report one reader opening one
   * docs page as a dozen views, and the visual-diff job as a traffic spike. The
   * absence is the decision.
   */
  it.each(['previewHead', 'previewBody'] as const)(
    'does not reach the preview via %s',
    (key) => {
      expect(config[key]).toBeUndefined();
    },
  );
});

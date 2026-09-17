/**
 * Vercel Web Analytics for the published Storybook.
 *
 * The three Next.js surfaces get this from a React component (see the Web
 * Analytics docs page). This app has no React shell to put a component in — it
 * is a static `storybook build` — so the beacon is a pair of script tags
 * written into the manager's head at build time.
 *
 * The manager, and never the preview. `managerHead` reaches
 * `storybook-static/index.html`; `previewHead` would reach `iframe.html`, which
 * is loaded once per story render, per docs page, per theme — and once more for
 * every shot the differ takes, since `capture.mjs` navigates it directly. A
 * beacon there would report one reader opening one docs page as a dozen views,
 * and the visual-diff job as a traffic spike.
 *
 * Modelled on @vercel/analytics 2.0.1 `dist/index.mjs` — `initQueue`,
 * `loadProps`, `getScriptSrc` and `makeAbsolute` — because that is the contract
 * the `script.js` this loads expects to be called under. When that package is
 * bumped in the other three apps, diff those four functions against this file.
 */

/**
 * The two Vercel system variables this reads, and deliberately not
 * `NodeJS.ProcessEnv`. `process.env` is an index signature of
 * `string | undefined`, so it is assignable to this without a cast; the suite
 * can hand it a plain object without one either. Narrowing also states the
 * contract outright: these two decide everything, and nothing here may reach
 * for a third.
 */
export type AnalyticsEnv = {
  VERCEL_ENV?: string | undefined;
  VERCEL_OBSERVABILITY_CLIENT_CONFIG?: string | undefined;
};

/** The fields of the injected `analytics` block this reproduces. The package
 *  reads six more (`basePath`, `dsn`, `mode`, `debug`, `disableAutoTrack`,
 *  `sessionEndpoint`); none has a meaning for a static site served from a
 *  project root, so none is carried. */
type AnalyticsConfig = {
  scriptSrc?: string | undefined;
  viewEndpoint?: string | undefined;
  eventEndpoint?: string | undefined;
};

/** `getScriptSrc`'s final fallback, for a project with no injected config. */
const DEFAULT_SCRIPT_SRC = '/_vercel/insights/script.js';

/** The queue the loader drains once it arrives — `initQueue`, behaviour for
 *  behaviour. Anything calling `window.va` before `script.js` lands (which is
 *  the very next tag) is buffered on `window.vaq`. A `function` expression
 *  rather than an arrow because it reads `arguments`. */
const QUEUE_STUB =
  'window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };';

/**
 * The `beforeSend` the manager registers.
 *
 * INLINED VERBATIM into the page, via `.toString()`. Three rules follow, and
 * none is negotiable:
 *   - it closes over NOTHING — no import, no module constant, no helper. The
 *     copy that runs in a reader's browser is re-parsed in an empty scope.
 *   - it must not throw. The loader calls it on every beacon, and a throw there
 *     costs the event.
 *   - its source text must never contain the characters `</script`.
 * The suite enforces all three by running the emitted script rather than this
 * binding — see `queuedBeforeSend` in analytics-head.test.ts.
 *
 * WHY it exists: every URL this Storybook has is `/index.html?path=/docs/x--docs`
 * — vercel.json redirects `/` there — so untouched, the Vercel Pages panel
 * reports the whole site as one row. Rewriting `url` to `origin + <the path
 * param>` gives each docs page its own row, and dropping the rest of the query
 * (`globals=`, addon state) stops those rows fragmenting one page into a dozen.
 */
export function rewriteAnalyticsUrl<E extends { url: string }>(event: E): E {
  try {
    const parsed = new URL(event.url);
    const path = parsed.searchParams.get('path');

    // Rooted, and not protocol-relative. The parameter is reader-controllable
    // through a crafted link, and this concatenates it onto an origin: `?path=`
    // holding `docs/x` would report `https://hostdocs/x`, and `//elsewhere/x`
    // would report a row that reads as somebody else's domain. Neither reaches
    // markup — this value is only ever a string in our own dashboard — but a
    // row nobody can account for is worth more than the two comparisons it
    // costs to refuse.
    if (!path?.startsWith('/') || path.startsWith('//')) return event;

    return { ...event, url: parsed.origin + path };
  } catch {
    return event;
  }
}

/**
 * HTML-attribute escaping, and deliberately not `JSON.stringify`.
 *
 * `JSON.stringify` escapes for a JavaScript string literal: it turns `a"b` into
 * `"a\"b"`, and the HTML tokenizer does not honour backslash escapes — pasted
 * into `src="a\"b"` the attribute ends at the backslash-quote and everything
 * after it is parsed as further attributes. Nothing env-derived reaches a JS
 * string in this module; all of it reaches an HTML attribute, so this is the
 * only quoting primitive the file needs.
 *
 * It returns the quotes as well as the body, so a caller cannot escape a value
 * and then forget to quote it. `&` is replaced first, or it would double-escape
 * the output of the other three. `'` is not escaped because this always emits
 * double quotes, and it always emits them because it owns them.
 */
const attributeValue = (value: string): string => {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `"${escaped}"`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * The `analytics` block out of `VERCEL_OBSERVABILITY_CLIENT_CONFIG`, or nothing.
 *
 * Absent, unparseable and the wrong shape all mean the same thing: take the
 * defaults, say nothing. A throw from here would fail `storybook build` — the
 * whole deployment — over a variable this app never declared and cannot see the
 * value of.
 */
const analyticsBlock = (raw: string | undefined): Record<string, unknown> => {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed) || !isRecord(parsed.analytics)) return {};

    return parsed.analytics;
  } catch {
    return {};
  }
};

/** Stricter than the package, on purpose: `{"analytics":{"scriptSrc":7}}` is a
 *  config the package would stringify into the tag, and this one ignores. */
const readString = (source: Record<string, unknown>, key: string) => {
  const value = source[key];

  return typeof value === 'string' ? value : undefined;
};

const parseConfig = (raw: string | undefined): AnalyticsConfig => {
  const analytics = analyticsBlock(raw);

  return {
    scriptSrc: readString(analytics, 'scriptSrc'),
    viewEndpoint: readString(analytics, 'viewEndpoint'),
    eventEndpoint: readString(analytics, 'eventEndpoint'),
  };
};

/**
 * `makeAbsolute`, behaviour for behaviour: an absolute URL or a root-relative
 * path is left alone, anything else is made root-relative. The failure it
 * prevents is a relative `src` resolving against `/index.html`'s directory,
 * which on a deep docs URL is not the root it was written for.
 *
 * Note what it does not do — it never inspects the scheme. That is the
 * package's behaviour and is kept: whoever can set this variable already
 * controls the deployment, so what this guards against is a typo, not an
 * attacker.
 */
const makeAbsolute = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')
    ? url
    : `/${url}`;

/** Omitted rather than emitted empty: `data-view-endpoint=""` is a value the
 *  loader reads and tries to POST to, where an absent attribute is a default. */
const endpointAttribute = (name: string, value: string | undefined) =>
  value === undefined ? '' : ` ${name}=${attributeValue(makeAbsolute(value))}`;

const snippet = (config: AnalyticsConfig) => {
  const src = config.scriptSrc ? makeAbsolute(config.scriptSrc) : DEFAULT_SCRIPT_SRC;
  const endpoints =
    endpointAttribute('data-view-endpoint', config.viewEndpoint) +
    endpointAttribute('data-event-endpoint', config.eventEndpoint);

  return [
    '<script>',
    QUEUE_STUB,
    `window.va('beforeSend', (${rewriteAnalyticsUrl.toString()}));`,
    '</script>',
    `<script defer src=${attributeValue(src)}${endpoints}></script>`,
  ].join('\n');
};

/**
 * The manager-head snippet for this environment, or the empty string.
 *
 * The same gate apps/blog, apps/manual and apps/visual-diff-ui draw, for the
 * same reason: a preview build sets NODE_ENV=production too, so the vendor's
 * own environment detection would count a reviewer clicking through a
 * login-protected preview as a reader, into the live dataset. `VERCEL_ENV` is
 * injected by Vercel, is absent locally and in CI, and nobody declares it.
 *
 * Unlike the Next apps, this gate withholds the bytes as well as the beacon —
 * there is no bundler here that could have already inlined the branch.
 */
export const analyticsHead = (env: AnalyticsEnv): string =>
  env.VERCEL_ENV === 'production'
    ? snippet(parseConfig(env.VERCEL_OBSERVABILITY_CLIENT_CONFIG))
    : '';

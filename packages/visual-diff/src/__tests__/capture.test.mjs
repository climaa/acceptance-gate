import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { COLOR_SCHEME_GLOBAL, DETERMINISM, VIEWPORTS } from '../policy.mjs';
import {
  ERROR_OVERLAY_EXPRESSION,
  STORY_PHASES_EXPRESSION,
  SanityError,
  buildStoryUrl,
  drainQueue,
  ensureViewport,
  fontCheckSpec,
  fontsLoadCheckExpression,
  isLoopbackUrl,
  isZeroSizeError,
  filterNeedles,
  matchesFilter,
  pngSize,
  stableWaitMs,
  themeSanity,
  viewportSanity,
} from '../capture.mjs';

const STORY_ID = 'atoms-button--primary';
const BASE_URL = 'http://127.0.0.1:41234';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** The IHDR chunk's own length prefix: thirteen bytes of header follow the name. */
const IHDR_LENGTH = [0, 0, 0, 13];
/** `IHDR` in ASCII — the first chunk of every PNG, and the one carrying the size. */
const IHDR = [0x49, 0x48, 0x44, 0x52];
/** Width and height open the IHDR data, four bytes each. */
const WIDTH_OFFSET = PNG_SIGNATURE.length + IHDR_LENGTH.length + IHDR.length;

/** A story as `index.json` writes it, narrowed to the two fields `--filter` reads. */
const story = (overrides = {}) => ({
  id: STORY_ID,
  title: 'Atoms/Button',
  ...overrides,
});

/** A stand-in for a pooled page: `ensureViewport` needs nothing else off a real one. */
const fakePage = () => {
  /** @type {{ width: number, height: number }[]} */
  const resizes = [];

  return {
    resizes,
    setViewportSize: async (size) => {
      resizes.push(size);
    },
  };
};

describe('buildStoryUrl', () => {
  it('navigates the preview iframe directly, never the manager shell', () => {
    const url = buildStoryUrl(BASE_URL, { id: STORY_ID, theme: 'light' });

    expect(url.startsWith(`${BASE_URL}/iframe.html?`)).toBe(true);
  });

  it('leaves the globals colon literal — percent-encoding drops the parameter', () => {
    const url = buildStoryUrl(BASE_URL, { id: STORY_ID, theme: 'dark' });

    expect(url).toContain(`globals=${COLOR_SCHEME_GLOBAL}:dark`);
  });

  it('names the global from policy rather than restating it', () => {
    const url = buildStoryUrl(BASE_URL, { id: STORY_ID, theme: 'dark' });

    expect(url).not.toContain('theme:dark');
  });

  it('carries the story id', () => {
    const url = buildStoryUrl(BASE_URL, { id: STORY_ID, theme: 'light' });

    expect(url).toContain(`id=${STORY_ID}`);
  });

  it('tolerates a base url with a trailing slash', () => {
    const url = buildStoryUrl(`${BASE_URL}/`, { id: STORY_ID, theme: 'light' });

    expect(url).not.toContain('//iframe.html');
  });
});

describe('matchesFilter', () => {
  it('keeps every story when no filter was given', () => {
    const kept = matchesFilter(undefined, story());

    expect(kept).toBe(true);
  });

  it('matches a substring of the id', () => {
    const kept = matchesFilter('button--pri', story());

    expect(kept).toBe(true);
  });

  it('matches a substring of the title', () => {
    const kept = matchesFilter('atoms/', story());

    expect(kept).toBe(true);
  });

  it('ignores case on both sides', () => {
    const kept = matchesFilter('BuTtOn', story({ id: 'atoms-BUTTON--primary' }));

    expect(kept).toBe(true);
  });

  it('rejects a story matching neither field', () => {
    const kept = matchesFilter('postcard', story());

    expect(kept).toBe(false);
  });

  it('matches on the id alone when the story carries no title', () => {
    const kept = matchesFilter('button', { id: STORY_ID });

    expect(kept).toBe(true);
  });

  it('keeps every story for an empty filter — `--filter=` is not "match nothing"', () => {
    const kept = matchesFilter('', story());

    expect(kept).toBe(true);
  });

  // Several filters are a union, not an intersection: a reviewer who ticked Button and
  // Badge means both, and no story is ever both at once — an intersection would capture
  // nothing every time.
  it('keeps a story matching any one of several filters', () => {
    const kept = matchesFilter(['molecules-card', 'atoms-button'], story());

    expect(kept).toBe(true);
  });

  it('rejects a story matching none of several filters', () => {
    const kept = matchesFilter(['molecules-card', 'organisms-table'], story());

    expect(kept).toBe(false);
  });

  it('keeps every story for an empty list — nothing ticked is not "capture nothing"', () => {
    const kept = matchesFilter([], story());

    expect(kept).toBe(true);
  });

  it('ignores the blanks in a list', () => {
    const kept = matchesFilter(['', '   ', 'button'], story());

    expect(kept).toBe(true);
  });

  // The seam between the two fields is not a place a match may span: `--primaryAtoms`
  // exists in neither the id nor the title, and only in the two glued together.
  it('never matches across the join between id and title', () => {
    const kept = matchesFilter('primaryatoms', story());

    expect(kept).toBe(false);
  });
});

describe('filterNeedles', () => {
  it.each([
    [undefined, []],
    ['', []],
    ['   ', []],
    ['Button', ['button']],
    [
      ['Button', 'Badge'],
      ['button', 'badge'],
    ],
    [[], []],
  ])('reads %j as %j', (filter, needles) => {
    expect(filterNeedles(filter)).toEqual(needles);
  });
});

describe('drainQueue', () => {
  it('hands every item to exactly one worker', async () => {
    const items = Array.from({ length: 10 }, (_, index) => index);
    /** @type {number[]} */ const handled = [];

    await drainQueue(items, ['a', 'b', 'c', 'd'], async (_worker, item) => {
      handled.push(item);
      return item;
    });

    expect(handled.slice().sort((a, b) => a - b)).toEqual(items);
  });

  it('returns results in item order, not completion order', async () => {
    const items = [0, 1, 2, 3, 4, 5];
    // The first item finishes last: a queue that appended results as they landed
    // would report the whole run against the wrong variants.
    const handle = async (/** @type {string} */ _worker, /** @type {number} */ item) => {
      await new Promise((done) => setTimeout(done, item === 0 ? 20 : 0));
      return `#${item}`;
    };

    const results = await drainQueue(items, ['a', 'b'], handle);

    expect(results).toEqual(items.map((item) => `#${item}`));
  });

  it('runs no more than one item per worker at a time', async () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    await drainQueue(items, ['a', 'b', 'c', 'd'], async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((done) => setTimeout(done, 1));
      inFlight -= 1;
    });

    expect(peak).toBe(4);
  });

  it('spreads the queue across every worker rather than draining it on one', async () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    /** @type {string[]} */ const usedBy = [];

    await drainQueue(items, ['a', 'b', 'c', 'd'], async (worker) => {
      usedBy.push(worker);
      await new Promise((done) => setTimeout(done, 1));
    });

    expect(new Set(usedBy)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('handles fewer items than workers', async () => {
    const results = await drainQueue([1], ['a', 'b', 'c', 'd'], async (_w, item) => item);

    expect(results).toEqual([1]);
  });

  it('returns nothing for an empty queue', async () => {
    const results = await drainQueue([], ['a'], async () => 'never');

    expect(results).toEqual([]);
  });

  it('refuses a pool with no workers rather than hanging on a full queue', async () => {
    await expect(drainQueue([1, 2], [], async () => 'never')).rejects.toThrow(/worker/);
  });
});

describe('ensureViewport', () => {
  it('resizes the page to the policy size for the named viewport', async () => {
    const page = fakePage();

    await ensureViewport(page, 'mobile');

    expect(page.resizes).toEqual([VIEWPORTS.mobile]);
  });

  it('does not resize twice for the same viewport on the same page', async () => {
    const page = fakePage();

    await ensureViewport(page, 'desktop');
    await ensureViewport(page, 'desktop');

    expect(page.resizes).toHaveLength(1);
  });

  it('resizes again when the same page switches viewport', async () => {
    const page = fakePage();

    await ensureViewport(page, 'desktop');
    await ensureViewport(page, 'mobile');

    expect(page.resizes).toEqual([VIEWPORTS.desktop, VIEWPORTS.mobile]);
  });

  it('caches per page, so one worker’s resize never satisfies another’s', async () => {
    // The bug this guards: a shared cache lets page B skip its own resize because
    // page A already applied that viewport, and B shoots "mobile" at 1280.
    const first = fakePage();
    const second = fakePage();

    await ensureViewport(first, 'mobile');
    await ensureViewport(second, 'mobile');

    expect(second.resizes).toEqual([VIEWPORTS.mobile]);
  });

  it('throws on a viewport outside the matrix rather than shooting at the last size', async () => {
    const page = fakePage();

    await expect(ensureViewport(page, 'tablet')).rejects.toThrow(/tablet/);
  });
});

/** A PNG whose IHDR says `width × height` and whose pixel data is one filler byte, so
 *  two shots of the same size can still differ byte-wise. No decoder is involved: the
 *  gates read geometry out of the header and compare the rest for equality. */
const png = (width, height, filler = 0) => {
  // Zeroes hold the place of the width and height, written through the view below.
  const sizeBytes = new Array(8).fill(0);
  const bytes = new Uint8Array([
    ...PNG_SIGNATURE,
    ...IHDR_LENGTH,
    ...IHDR,
    ...sizeBytes,
    filler,
  ]);

  const header = new DataView(bytes.buffer);
  header.setUint32(WIDTH_OFFSET, width);
  header.setUint32(WIDTH_OFFSET + 4, height);

  return bytes;
};

/** A capture result as `captureAll` returns it, narrowed to what the gates read. */
const shot = (overrides = {}) => ({
  id: STORY_ID,
  tier: 'templates',
  viewport: 'desktop',
  theme: 'light',
  bytes: png(1280, 800),
  ...overrides,
});

/** The light/dark pair of one story at one viewport, differing in their pixel bytes
 *  unless `identical` says the theme wiring is dead. */
const themePair = (overrides = {}, { identical = false } = {}) => [
  shot({ theme: 'light', bytes: png(1280, 800, 1), ...overrides }),
  shot({ theme: 'dark', bytes: png(1280, 800, identical ? 1 : 2), ...overrides }),
];

describe('pngSize', () => {
  it('reads the size out of the IHDR', () => {
    const size = pngSize(png(390, 844));

    expect(size).toEqual({ width: 390, height: 844 });
  });

  it('returns null for bytes that are not a PNG', () => {
    const size = pngSize(new Uint8Array(32));

    expect(size).toBeNull();
  });

  it('returns null for a buffer too short to hold an IHDR', () => {
    const size = pngSize(png(390, 844).slice(0, 20));

    expect(size).toBeNull();
  });

  it('returns null when nothing was captured', () => {
    const size = pngSize(null);

    expect(size).toBeNull();
  });
});

describe('themeSanity', () => {
  it('passes when a story renders differently in the two themes', () => {
    const shots = themePair();

    expect(() => themeSanity(shots)).not.toThrow();
  });

  it('trips when every light/dark pair came back byte-identical', () => {
    const shots = [
      ...themePair({ id: 'a' }, { identical: true }),
      ...themePair({ id: 'b' }, { identical: true }),
    ];

    expect(() => themeSanity(shots)).toThrow(SanityError);
  });

  it('passes when one pair differs — a theme-neutral component is not a broken gate', () => {
    const shots = [
      ...themePair({ id: 'a' }, { identical: true }),
      ...themePair({ id: 'b' }),
    ];

    expect(() => themeSanity(shots)).not.toThrow();
  });

  it('passes when the run captured no light/dark pair at all', () => {
    // `--filter` can narrow a run to one theme; there is then nothing to prove.
    const shots = [shot({ theme: 'light' })];

    expect(() => themeSanity(shots)).not.toThrow();
  });

  it('pairs within one viewport, never across two', () => {
    const shots = [
      shot({ theme: 'light', viewport: 'desktop', bytes: png(1280, 800, 1) }),
      shot({ theme: 'dark', viewport: 'mobile', bytes: png(390, 844, 1) }),
    ];

    expect(() => themeSanity(shots)).not.toThrow();
  });

  it('ignores a shot that captured nothing, rather than reading it as a match', () => {
    const shots = [shot({ theme: 'light' }), shot({ theme: 'dark', bytes: null })];

    expect(() => themeSanity(shots)).not.toThrow();
  });

  it('names the theme global, so the reader knows where to look', () => {
    const shots = themePair({}, { identical: true });

    expect(() => themeSanity(shots)).toThrow(new RegExp(COLOR_SCHEME_GLOBAL));
  });
});

describe('viewportSanity', () => {
  it('passes when the mobile shot is narrower than its desktop sibling', () => {
    const shots = [
      shot({ viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ viewport: 'mobile', bytes: png(390, 844) }),
    ];

    expect(() => viewportSanity(shots)).not.toThrow();
  });

  it('trips when a "mobile" shot came back at the desktop width', () => {
    const shots = [
      shot({ viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ viewport: 'mobile', bytes: png(1280, 844) }),
    ];

    expect(() => viewportSanity(shots)).toThrow(SanityError);
  });

  it('trips when the mobile shot is wider than the desktop one', () => {
    const shots = [
      shot({ viewport: 'desktop', bytes: png(390, 800) }),
      shot({ viewport: 'mobile', bytes: png(1280, 844) }),
    ];

    expect(() => viewportSanity(shots)).toThrow(SanityError);
  });

  it('passes when no story was captured at mobile at all', () => {
    // Atoms and molecules are desktop-only, so an atoms-scoped run has no pair.
    const shots = [shot({ tier: 'atoms', viewport: 'desktop' })];

    expect(() => viewportSanity(shots)).not.toThrow();
  });

  it('passes when one pair reflowed — the others may legitimately not', () => {
    const shots = [
      shot({ id: 'a', viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ id: 'a', viewport: 'mobile', bytes: png(1280, 844) }),
      shot({ id: 'b', viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ id: 'b', viewport: 'mobile', bytes: png(390, 844) }),
    ];

    expect(() => viewportSanity(shots)).not.toThrow();
  });

  it('pairs within one theme, never across two', () => {
    const shots = [
      shot({ theme: 'light', viewport: 'desktop', bytes: png(390, 800) }),
      shot({ theme: 'dark', viewport: 'mobile', bytes: png(1280, 844) }),
    ];

    expect(() => viewportSanity(shots)).not.toThrow();
  });

  it('ignores a pair whose shot has no readable size', () => {
    const shots = [
      shot({ viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ viewport: 'mobile', bytes: null }),
    ];

    expect(() => viewportSanity(shots)).not.toThrow();
  });

  it('names a story whose mobile shot did not narrow', () => {
    const shots = [
      shot({ viewport: 'desktop', bytes: png(1280, 800) }),
      shot({ viewport: 'mobile', bytes: png(1280, 844) }),
    ];

    expect(() => viewportSanity(shots)).toThrow(new RegExp(STORY_ID));
  });
});

describe('isZeroSizeError', () => {
  // Playwright words the same failure differently across the element-handle and the
  // locator paths, so the classifier matches a set of spellings rather than one.
  it.each([
    ['the element-handle wording', 'elementHandle.screenshot: Node has 0 size.'],
    ['the locator wording', 'locator.screenshot: Element is not visible'],
    [
      'a wait that timed out on visibility',
      'locator.screenshot: Timeout 30000ms exceeded.\n  - waiting for element to be visible',
    ],
  ])('recognises %s', (_label, message) => {
    const zeroSize = isZeroSizeError(new Error(message));

    expect(zeroSize).toBe(true);
  });

  it('does not claim an unrelated browser failure was a zero-size element', () => {
    const zeroSize = isZeroSizeError(new Error('page.goto: net::ERR_CONNECTION_REFUSED'));

    expect(zeroSize).toBe(false);
  });

  it('survives a thrown value that is not an Error', () => {
    const zeroSize = isZeroSizeError('boom');

    expect(zeroSize).toBe(false);
  });
});

describe('isLoopbackUrl', () => {
  it.each([
    'http://127.0.0.1:41234/iframe.html',
    'http://localhost:6006/index.json',
    'http://[::1]:41234/assets/preview.mjs',
  ])('lets %s through to the corpus', (url) => {
    const loopback = isLoopbackUrl(url);

    expect(loopback).toBe(true);
  });

  it.each([
    'https://fonts.googleapis.com/css2?family=Fraunces',
    'https://example.com/analytics.js',
    'http://127.0.0.1.evil.example/pixel.gif',
    'http://192.168.1.10/iframe.html',
    'not a url at all',
  ])('aborts %s', (url) => {
    const loopback = isLoopbackUrl(url);

    expect(loopback).toBe(false);
  });
});

describe('fontCheckSpec', () => {
  it('builds a font shorthand for the first family of the stack', () => {
    const spec = fontCheckSpec("'Atkinson Hyperlegible', sans-serif");

    expect(spec).toBe('1em "Atkinson Hyperlegible"');
  });

  it('accepts an unquoted family', () => {
    const spec = fontCheckSpec('Fraunces, serif');

    expect(spec).toBe('1em "Fraunces"');
  });

  it('drops the fallbacks — a stack that reached its generic family is not loaded', () => {
    const spec = fontCheckSpec("'JetBrains Mono', monospace");

    expect(spec).not.toContain('monospace');
  });

  it('returns null when the property resolved to nothing', () => {
    // An empty custom property means the design system stylesheet never loaded, which
    // is a louder failure than a missing face and must not check as "font present".
    const spec = fontCheckSpec('  ');

    expect(spec).toBeNull();
  });
});

describe('fontsLoadCheckExpression', () => {
  it('forces the load before checking it, both against the same spec', () => {
    const expression = fontsLoadCheckExpression('1em "Atkinson Hyperlegible"');

    expect(expression).toContain('document.fonts.load(');
    expect(expression).toContain('document.fonts.check(');
    expect(expression).toContain('"1em \\"Atkinson Hyperlegible\\""');
  });

  it('runs the check only after the load settles, not in parallel', () => {
    // A load-then-check race would defeat the whole fix: `check` has to observe the
    // fetch this expression itself triggered, not a fetch some earlier call started.
    const expression = fontsLoadCheckExpression('1em "Fraunces"');

    expect(expression.indexOf('fonts.load')).toBeLessThan(
      expression.indexOf('fonts.check'),
    );
    expect(expression).toMatch(/fonts\.load\([^)]*\)\.then\(/);
  });
});

describe('stableWaitMs', () => {
  it('waits the policy minimum at the bottom of the draw', () => {
    const wait = stableWaitMs(() => 0);

    expect(wait).toBe(DETERMINISM.stableShotIntervalMs.min);
  });

  it('waits the policy maximum at the top of the draw', () => {
    const wait = stableWaitMs(() => 1);

    expect(wait).toBe(DETERMINISM.stableShotIntervalMs.max);
  });

  it('never leaves the policy range, whatever the draw', () => {
    const { min, max } = DETERMINISM.stableShotIntervalMs;
    const draws = Array.from({ length: 200 }, (_, index) => index / 199);

    const waits = draws.map((draw) => stableWaitMs(() => draw));

    expect(waits.every((wait) => wait >= min && wait <= max)).toBe(true);
  });

  it('jitters rather than pausing the same length twice', () => {
    // A fixed pause can period-align with an animation and compare two shots taken at
    // the same point of its cycle, which reads as stable when nothing is.
    const waits = new Set(Array.from({ length: 20 }, () => stableWaitMs()));

    expect(waits.size).toBeGreaterThan(1);
  });
});

/** @param {string} expression @param {object} globals */
const inPage = (expression, globals) =>
  vm.runInContext(expression, vm.createContext(globals));

/** A `document` exposing only what the overlay probe reads. */
const fakeDocument = ({ bodyClasses = [], errorDisplay = null } = {}) => ({
  body: { classList: { contains: (name) => bodyClasses.includes(name) } },
  querySelector: () => errorDisplay,
});

describe('ERROR_OVERLAY_EXPRESSION', () => {
  it('reports the overlay Storybook reveals by putting a class on the body', () => {
    const document = fakeDocument({ bodyClasses: ['sb-show-errordisplay'] });

    const shown = inPage(ERROR_OVERLAY_EXPRESSION, { document });

    expect(shown).toBe(true);
  });

  it('reports a visible error display', () => {
    const document = fakeDocument({ errorDisplay: { offsetParent: {} } });

    const shown = inPage(ERROR_OVERLAY_EXPRESSION, { document });

    expect(shown).toBe(true);
  });

  it('ignores the hidden error display every Storybook page carries', () => {
    // iframe.html always contains #error-display; presence alone would bucket the whole
    // corpus as errored.
    const document = fakeDocument({ errorDisplay: { offsetParent: null } });

    const shown = inPage(ERROR_OVERLAY_EXPRESSION, { document });

    expect(shown).toBe(false);
  });

  it('reports no overlay on a page that rendered its story', () => {
    const shown = inPage(ERROR_OVERLAY_EXPRESSION, { document: fakeDocument() });

    expect(shown).toBe(false);
  });
});

describe('STORY_PHASES_EXPRESSION', () => {
  it('reads the phase of every render the preview is tracking', () => {
    const globals = {
      __STORYBOOK_PREVIEW__: {
        storyRenders: [{ phase: 'rendering' }, { phase: 'played' }],
      },
    };

    const phases = inPage(STORY_PHASES_EXPRESSION, globals);

    expect(phases).toEqual(['rendering', 'played']);
  });

  it('reads no phase from a preview that never started', () => {
    const phases = inPage(STORY_PHASES_EXPRESSION, {});

    expect(phases).toEqual([]);
  });
});

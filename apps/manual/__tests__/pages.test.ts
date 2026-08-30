import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ManualPage from '@/app/[slug]/page';
import { SCREENSHOTS } from '@/content/screenshots';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';

/**
 * That a reader actually sees the scenarios.
 *
 * `sync.test.ts` proves the data the pages are built from is the data in the
 * `.feature` files. That is a different claim from this one, and only this one
 * would notice `StepList` rendering an empty list: every other test in this
 * workspace passes with nothing on the page at all.
 *
 * Deliberately a smoke test over visible text, not a comparison of rendered HTML
 * against the source. `DESIGN.md` §7 rules that out and is right to — keywords
 * become list markers, and that is rendering rather than drift. What is asserted
 * here is presence and order, which is what "the page shows the requirement"
 * means to someone reading it.
 *
 * `renderToStaticMarkup` rather than a DOM: the page is an async Server
 * Component, so awaiting it yields an ordinary element tree, and none of what it
 * renders needs a browser. That keeps this suite in a node environment with no
 * jsdom to install.
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
};

/** The visible text of a page, markup and whitespace collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A stylesheet as its rules, whitespace collapsed and comments dropped — the
 * same parse `apps/blog/__tests__/globals-css.test.ts` uses, for the same
 * reason: matching formatted text asserts Prettier's output, so the test breaks
 * on a reformat and holds nothing that a reordering could not slip past.
 *
 * Flat by design, which is safe only while this stylesheet is. A nested block —
 * `@media`, `@supports`, `@layer` — would break the brace pairing below; today
 * `globals.css` has none, and its one `@import` is stripped with the other
 * at-statements before the pairing runs.
 */
function rulesOf(css: string): { selector: string; declarations: string }[] {
  const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');

  return [
    ...css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@[^;{]*;/g, '')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map(([, selector, declarations]) => ({
    selector: collapse(selector ?? ''),
    declarations: collapse(declarations ?? ''),
  }));
}

/** Where a `/images/…` src actually lives, from this workspace's root. */
function fileFor(src: string): string {
  return join('public', src.replace(/^\//, ''));
}

/** Every declared capture, flattened, each labelled by the page and theme it
 *  belongs to so a failure names which one is wrong rather than which index. */
function captures(): { at: string; src: string; declared: string }[] {
  return Object.entries(SCREENSHOTS).flatMap(([slug, shot]) =>
    (['light', 'dark'] as const).map((theme) => ({
      at: `${slug}.${theme}`,
      src: shot[theme],
      declared: `${shot.width}×${shot.height}`,
    })),
  );
}

/**
 * Frame markers, which are the only segments carrying the image's size.
 * `C4`, `C8` and `CC` sit in the same range and are not frames — a Huffman
 * table, an extension and an arithmetic-coding table — so reading a size out of
 * one would return two bytes of something else entirely.
 */
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * A JPEG's intrinsic size, read from its own header.
 *
 * By hand rather than by dependency: this workspace's entire external budget is
 * one package, and spending a second on four numbers a header states outright
 * would be the wrong trade. The walk is the segment chain — each segment
 * declares its own length — stopping at the first frame, which always precedes
 * the scan data in a file a browser will render.
 */
function jpegSize(file: string): string {
  const bytes = readFileSync(file);
  let offset = 2; // past the start-of-image marker

  while (offset + 9 <= bytes.length) {
    // Padding between segments is legal and is always `0xff`, so anything else
    // here means the chain is off — step a byte and look again rather than
    // reading a length out of the middle of something.
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    if (SOF_MARKERS.has(bytes[offset + 1]!)) {
      return `${bytes.readUInt16BE(offset + 7)}×${bytes.readUInt16BE(offset + 5)}`;
    }

    offset += 2 + bytes.readUInt16BE(offset + 2);
  }

  throw new Error(`${file} carries no frame header — not a JPEG?`);
}

async function renderPageHtml(slug: string): Promise<string> {
  const element = await ManualPage({ params: Promise.resolve({ slug }) });

  return renderToStaticMarkup(element);
}

async function renderPage(slug: string): Promise<string> {
  return textOf(await renderPageHtml(slug));
}

describe.each(MANUAL_PAGES)('the $slug page', (page) => {
  it('shows its title and every scenario name', async () => {
    const text = await renderPage(page.slug);
    const feature = parseManualPage(page);

    expect(text).toContain(page.title);
    const missing = feature.scenarios.filter((s) => !text.includes(s.name));
    expect(missing.map((s) => s.name)).toEqual([]);
  });

  it('shows every step of every scenario', async () => {
    const text = await renderPage(page.slug);
    const steps = parseManualPage(page).scenarios.flatMap((s) => s.steps);

    // Asserted rather than assumed: a feature that parsed to no steps would make
    // the filter below empty and this case would pass having checked nothing.
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.filter((step) => !text.includes(step.text)).map((s) => s.text)).toEqual(
      [],
    );
  });

  it('keeps the authored order of the steps it shows', async () => {
    const text = await renderPage(page.slug);
    const steps = parseManualPage(page).scenarios.flatMap((s) => s.steps);

    // Walked with a moving cursor rather than compared as first-occurrence
    // positions, because step text repeats heavily — `I visit the console`
    // appears in six of seven console scenarios, so `indexOf` from zero returns
    // the same early match for every one of them and order becomes
    // unmeasurable. Searching onward from the last match asserts what is
    // actually meant: the steps appear in sequence, which is the property a
    // keyword-grouped renderer would quietly break.
    let cursor = 0;
    const outOfOrder = steps.filter((step) => {
      const at = text.indexOf(step.text, cursor);
      if (at === -1) return true;
      cursor = at + step.text.length;
      return false;
    });

    expect(outOfOrder.map((step) => step.text)).toEqual([]);
  });

  it('shows its Background once, above the scenarios', async () => {
    const text = await renderPage(page.slug);
    const { background } = parseManualPage(page);

    if (background.length === 0) {
      expect(text).not.toContain('Before each task');
      return;
    }

    expect(text).toContain('Before each task');
    for (const step of background) {
      // Once, not once per scenario: repeating it is test-runner semantics
      // leaking into a manual.
      expect(text.split(step.text)).toHaveLength(2);
    }
  });

  it('shows its authored intro above the generated body', async () => {
    const text = await renderPage(page.slug);
    const firstScenario = parseManualPage(page).scenarios[0];

    expect(firstScenario).toBeDefined();
    expect(text.indexOf(page.title)).toBeLessThan(text.indexOf(firstScenario!.name));
  });
});

describe('screenshots', () => {
  it.each(MANUAL_PAGES)('$slug renders a figure only when it has one', async (page) => {
    const html = await renderPageHtml(page.slug);
    const shot = SCREENSHOTS[page.slug];

    if (!shot) {
      expect(html).not.toContain('manual-figure');
      return;
    }

    // Both sources and the alt, because a `Thumbnail` with no alt is an
    // illustration a screen reader cannot see past, and one with no src silently
    // renders its fallback instead.
    expect(html).toContain(shot.light);
    expect(html).toContain(shot.dark);
    expect(html).toContain(shot.alt.slice(0, 40));
    expect(html).toContain(shot.caption.slice(0, 40));
  });

  it('points every declared screenshot at files that are committed', () => {
    // A `Thumbnail` whose `src` 404s degrades to its fallback rather than
    // failing, so nothing else here would notice a typo or a missing file. Both
    // themes, because the dark half is invisible to a reader in light — a broken
    // path there survives every manual look at the page.
    const missing = captures().filter(({ src }) => !existsSync(fileFor(src)));

    expect(missing.map(({ at }) => at)).toEqual([]);
    expect(captures().length).toBeGreaterThan(0);
  });

  it('gives each theme a capture of its own', () => {
    // Compared as bytes, not as paths. Two names for one file is the copy-paste
    // this catches, and it survives every other case here: the paths differ, both
    // resolve, the page renders, and the reader in dark mode is handed the light
    // screenshot. A path comparison alone would miss the other half of it —
    // `cp console-light.jpg console-dark.jpg`, two real files with one picture in
    // them.
    const duplicated = Object.entries(SCREENSHOTS).filter(([, shot]) =>
      readFileSync(fileFor(shot.light)).equals(readFileSync(fileFor(shot.dark))),
    );

    expect(duplicated.map(([slug]) => slug)).toEqual([]);
  });

  it('declares the size both captures actually are', () => {
    // The drift this catches is a re-shoot of one theme at a different viewport,
    // which nothing else can see: the odd one out is invisible to anyone reading
    // in the other theme, and both files still exist and still differ.
    //
    // It guards a second thing on the way past. `width`/`height` are declared
    // once for the pair and reserve the figure's aspect before any bytes arrive
    // — the fix that took a measured 642px of layout shift to 0 — so a declared
    // size that no longer matches the file silently reintroduces the shift.
    const wrong = captures()
      .map((capture) => ({ ...capture, actual: jpegSize(fileFor(capture.src)) }))
      .filter(({ actual, declared }) => actual !== declared);

    expect(
      wrong.map(({ at, declared, actual }) => `${at}: ${declared} ≠ ${actual}`),
    ).toEqual([]);
  });

  it('hides the wrong capture in each theme, and never names a light theme', () => {
    // The swap is CSS, so nothing else in this suite can see it — every other
    // case here passes with both captures stacked on the page.
    //
    // The whole cascade, compared as an exact set rather than searched for a
    // substring. Both directions matter: a missing rule stops the swap, and an
    // *added* one is the actual trap — `[data-theme='light'] …` reads correctly
    // in review and matches nothing on a first visit, because `lib/theme.ts`
    // only ever sets `data-theme="dark"` and light is the absence of the
    // attribute. An extra entry here fails the comparison.
    //
    // `display` rather than a colour or a ratio: whether the element is in the
    // layout and the accessibility tree is structural, and it is the property
    // under test. Appearance stays with visual-diff.
    const swap = rulesOf(readFileSync(join('app', 'globals.css'), 'utf8')).filter(
      (rule) => rule.selector.includes('manual-figure__shot'),
    );

    expect(swap).toEqual([
      { selector: '.manual-figure__shot--dark', declarations: 'display: none;' },
      {
        selector: "[data-theme='dark'] .manual-figure__shot--light",
        declarations: 'display: none;',
      },
      {
        selector: "[data-theme='dark'] .manual-figure__shot--dark",
        declarations: 'display: block;',
      },
    ]);
  });
});

describe('the step meanings reach the rendered page', () => {
  /**
   * The seam nothing else covers. `app/[slug]/page.tsx` translates this app's
   * `keywordType` into the design system's `meaning`, and every other test here
   * reads visible text — so swapping `Action` for `Outcome` in that map would
   * leave all of them green while the page grouped acts under outcomes.
   */
  it('renders each step in the run its keyword type implies', async () => {
    const html = await renderPageHtml('console');
    const feature = parseManualPage(MANUAL_PAGES[0]!);

    const expected = feature.scenarios
      .flatMap((scenario) => scenario.steps)
      .reduce<(string | undefined)[]>((runs, step, index, steps) => {
        const RUN: Record<string, string | undefined> = {
          Context: 'context',
          Action: 'action',
          Outcome: 'outcome',
        };
        const previous = index > 0 ? runs[index - 1] : undefined;
        runs.push(step.keywordType === 'Conjunction' ? previous : RUN[step.keywordType]);
        return runs;
      }, []);

    const rendered = [...html.matchAll(/data-run="([a-z]+)"/g)].map(([, run]) => run);

    // Only the steps that land in a run are drawn with one, so the rendered list
    // is the expected one with the blanks removed.
    expect(rendered).toEqual(expected.filter(Boolean));
    expect(rendered.length).toBeGreaterThan(0);
  });
});

describe('tags are parsed but never drawn', () => {
  it('shows no @desktop on the report page', async () => {
    const text = await renderPage('report');
    const tagged = parseManualPage(MANUAL_PAGES[1]!).scenarios.filter(
      (s) => s.tags.length > 0,
    );

    // The fixture for this assertion is the live suite: if `@desktop` is ever
    // removed from the report feature, this stops testing anything.
    expect(tagged.length).toBeGreaterThan(0);
    expect(text).not.toContain('@desktop');
  });
});

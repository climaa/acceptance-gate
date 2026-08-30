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
    const declared = Object.values(SCREENSHOTS).flatMap((shot) => [
      shot.light,
      shot.dark,
    ]);
    const missing = declared.filter(
      (src) => !existsSync(join('public', src.replace(/^\//, ''))),
    );

    expect(missing).toEqual([]);
    expect(declared.length).toBeGreaterThan(0);
  });

  it('gives each theme its own capture', () => {
    // The failure this catches is a copy-paste that points both themes at one
    // file. Everything above still passes: the paths resolve, the page renders,
    // and the reader in dark mode gets the light screenshot back.
    const shared = Object.entries(SCREENSHOTS).filter(
      ([, shot]) => shot.light === shot.dark,
    );

    expect(shared.map(([slug]) => slug)).toEqual([]);
  });

  it('renders the light capture unconditionally and the dark one behind [data-theme]', () => {
    // The swap is CSS, so nothing else in this suite can see it. What is
    // asserted is the rule the head script makes necessary: light must be the
    // unqualified state, because a first visit carries no `data-theme` at all
    // and a `[data-theme="light"]` selector would match nothing.
    const css = readFileSync(join('app', 'globals.css'), 'utf8');

    expect(css).toContain('.manual-figure__shot--dark {\n  display: none;\n}');
    expect(css).toContain("[data-theme='dark'] .manual-figure__shot--light");
    expect(css).not.toContain("[data-theme='light'] .manual-figure__shot");
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

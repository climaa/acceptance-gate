import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StartPage from '@/app/start/page';
import { TOUR } from '@/content/tour';
import { MANUAL_PAGES } from '@/lib/allowlist';
import { parseManualPage } from '@/lib/features';
import { CONSOLE_URL } from '@/lib/site';
import { resolveStep, resolveTour } from '@/lib/tour';

/**
 * That the tour's links still land where the tour says they do.
 *
 * `/start` photographs nothing: every step is an address in the deployed
 * console, which is what keeps it from going stale and is also the one thing
 * about it that can silently break. A screenshot that is wrong looks wrong; a
 * link that is wrong looks exactly like a link.
 *
 * So the guarantee is assembled here out of three checks, none of which needs
 * a network. `resolveTour` already fails the build on a renamed scenario. This
 * file adds the other half: that every address names a report, a set and a
 * variant that are actually committed, and that every query string is spelled
 * in the parameters the console reads.
 *
 * Deliberately not an end-to-end scenario. This app is not in the acceptance
 * suite's `webServer` list, so covering it there means standing up a fourth
 * server and editing a `.feature` — and `.feature` files are product
 * requirements. The suite's own scenarios are what make the deep links a
 * guarantee; this file only proves the tour spells them correctly.
 */

/**
 * The console's fixtures, read across the workspace boundary.
 *
 * `turbo.json` names these files in `@gate/manual#test`'s `inputs`. Without
 * that the cache would report this suite fresh after the console's sample data
 * changed underneath it, which is the failure this whole file exists to catch.
 *
 * In the test only, never the build: `next build` following a literal path into
 * another workspace is a separate trap, and `lib/sources.ts` documents it.
 */
const FIXTURES = '../visual-diff-ui/fixtures';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** Every variant key a committed report holds, by report id. */
function variantsOf(reportId: string): string[] {
  const summary = readJson(join(FIXTURES, 'reports', reportId, 'summary.json')) as {
    variants?: { key: string }[];
  };

  return (summary.variants ?? []).map((variant) => variant.key);
}

/**
 * The search parameters the console actually reads, per surface.
 *
 * Transcribed rather than imported — `apps/manual` does not depend on
 * `@gate/visual-diff-ui` and should not start to for a test. The sources are
 * `components/RunPanel.tsx` (the dashboard) and `components/ReportResults.tsx`
 * (the report), and a name added there without being added here only ever
 * fails a tour step this list has not been taught about yet.
 */
const READS: Record<'dashboard' | 'report', readonly string[]> = {
  dashboard: ['mode', 'a', 'b', 'cn'],
  report: ['bucket', 'mode', 'filter', 'hideReviewed', 'story'],
};

/**
 * The compare ask's nonce. A tour link carrying one is a press that already
 * happened in somebody else's tab, so it is banned outright rather than merely
 * left off the list above.
 */
const ASK_PARAM = 'cn';

const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
};

/** Every `href` the markup carries, with its entities decoded — `&` in a query
 *  string is serialised as `&amp;`, and an undecoded compare is a compare that
 *  quietly never matches. */
function hrefsIn(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map(([, href]) =>
    (href ?? '').replace(
      /&(?:amp|lt|gt|quot|#x27|#39);/g,
      (entity) => ENTITIES[entity] ?? entity,
    ),
  );
}

const render = () => renderToStaticMarkup(StartPage());

describe('the tour resolves against the suite', () => {
  it('anchors every step on a scenario the feature still has', () => {
    expect(() => resolveTour()).not.toThrow();
  });

  it('renders the anchoring scenario’s real steps, not a copy of them', () => {
    for (const step of resolveTour()) {
      const page = MANUAL_PAGES.find((candidate) => candidate.slug === step.slug)!;
      const source = parseManualPage(page).scenarios.find(
        (scenario) => scenario.name === step.scenario,
      )!;

      expect(step.steps).toEqual(source.steps);
      expect(step.steps.length).toBeGreaterThan(0);
    }
  });

  /**
   * The failure mode the throw exists for, driven rather than assumed. A
   * renamed scenario is the likeliest way this page comes to lie, and the
   * message has to carry the replacement names or the fix is a hunt.
   */
  it('refuses an anchor the feature no longer has, and says what it does have', () => {
    const real = TOUR[0]!;
    const renamed = { ...real, scenario: 'A scenario nobody ever wrote' };

    expect(() => resolveStep(renamed)).toThrowError(/A scenario nobody ever wrote/);
    expect(() => resolveStep(renamed)).toThrowError(new RegExp(real.scenario));
  });

  it('accepts every anchor actually written', () => {
    for (const step of TOUR) {
      expect(() => resolveStep(step)).not.toThrow();
    }
  });
});

describe('every link lands somewhere committed', () => {
  it('points at the deployed console and nowhere else', () => {
    for (const step of resolveTour()) {
      expect(new URL(step.href).origin).toBe(new URL(CONSOLE_URL).origin);
    }
  });

  it('names only reports the console ships as fixtures', () => {
    for (const step of resolveTour()) {
      const [, section, id] = new URL(step.href).pathname.split('/');
      if (section !== 'report') continue;

      expect(variantsOf(id!).length).toBeGreaterThan(0);
    }
  });

  it('opens the modal on a variant that report actually holds', () => {
    for (const step of resolveTour()) {
      const url = new URL(step.href);
      const story = url.searchParams.get('story');
      if (!story) continue;

      const [, , id] = url.pathname.split('/');

      expect(variantsOf(id!)).toContain(story);
    }
  });
});

describe('every link is spelled in the console’s own parameters', () => {
  it('uses no parameter the console does not read', () => {
    for (const step of resolveTour()) {
      const url = new URL(step.href);
      const surface = url.pathname.startsWith('/report') ? 'report' : 'dashboard';
      const unknown = [...url.searchParams.keys()].filter(
        (name) => !READS[surface].includes(name),
      );

      expect({ at: step.title, unknown }).toEqual({ at: step.title, unknown: [] });
    }
  });

  /** Position, never the ask. The console mirrors where you are into the
   *  address on purpose; the nonce that sends a job is not part of that. */
  it('never carries the compare ask', () => {
    for (const step of resolveTour()) {
      expect(new URL(step.href).searchParams.has(ASK_PARAM)).toBe(false);
    }
  });
});

describe('the page shows what the data says', () => {
  it('gives every step a distinct title, which is also its key', () => {
    const titles = TOUR.map((step) => step.title);

    expect(new Set(titles).size).toBe(titles.length);
  });

  it('shows every authored sentence', () => {
    const text = textOf(render());
    const missing = TOUR.filter((step) => !text.includes(step.lede));

    expect(missing.map((step) => step.title)).toEqual([]);
  });

  it('shows every scenario step, in the order the feature writes them', () => {
    const text = textOf(render());

    for (const step of resolveTour()) {
      let cursor = -1;

      for (const line of step.steps) {
        const at = text.indexOf(line.text, cursor + 1);

        expect({ at: step.title, step: line.text, found: at > cursor }).toEqual({
          at: step.title,
          step: line.text,
          found: true,
        });
        cursor = at;
      }
    }
  });

  /**
   * Counted over the parsed attributes rather than by slicing the markup: a
   * step whose query string has two parameters is serialised with `&amp;`, so
   * a raw substring search for its href finds nothing and passes the day the
   * link disappears.
   */
  it('gives every step exactly one way into the console', () => {
    const rendered = hrefsIn(render());

    for (const step of resolveTour()) {
      const matching = rendered.filter((href) => href === step.href);

      expect({ at: step.title, count: matching.length }).toEqual({
        at: step.title,
        count: 1,
      });
    }
  });

  it('keeps the steps in the authored order', () => {
    const text = textOf(render());
    const positions = TOUR.map((step) => text.indexOf(step.title));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positions.every((position) => position > -1)).toBe(true);
  });
});

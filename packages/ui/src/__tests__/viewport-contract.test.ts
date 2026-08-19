/**
 * The viewport contract: a component that reflows with width must be captured at
 * more than one.
 *
 * `TIER_VIEWPORTS` captures atoms and molecules at desktop alone, and its
 * docstring gives the reason outright — they "do not change shape between
 * viewports, so capturing them at mobile would double the baseline count and
 * catch nothing". That premise is load-bearing, and it is the kind that stops
 * being true quietly: someone adds a breakpoint to an atom, and the corpus keeps
 * photographing the one width where the new rule does nothing.
 *
 * `ALL_VIEWPORTS_TAG` is the escape hatch for exactly that, and it went unused
 * for its whole existence. #306 is what the gap costs. A `flex-wrap: wrap` was
 * dropped from `.ds-segmented`, five segments overflowed a 320px viewport by
 * 80px — a WCAG 2.1 AA 1.4.10 failure, live — and that commit's own message says
 * why the gate said nothing: "`TIER_VIEWPORTS.atoms` is `['desktop']`, and the
 * story carries no `visual-diff:all-viewports` tag, so no baseline in the corpus
 * renders this atom at a width where it overflowed." It was found by a human
 * measuring in Chromium, and the follow-up it named was never done.
 *
 * So this is derived rather than a pinned list of three. A list would hold today
 * and say nothing the day a fourth component grows a breakpoint, which is the
 * edit that caused the bug in the first place. The rule reads the committed CSS:
 * if a component in a single-viewport tier declares something that can only mean
 * different things at different widths, its stories must be captured at all of
 * them.
 *
 * Keyed on width deliberately, never on `@media` at large — `Skeleton.css` and
 * `TriStateCheckbox.css` carry `prefers-reduced-motion` and nothing else, and a
 * motion query is not a reflow. Over-matching here would push baselines onto
 * components that cannot use them.
 *
 * Lexical, like `capture-contract.test.ts` beside it, and for the same reason:
 * it reads what Storybook's static CSF indexer reads. Comments are stripped from
 * the CSS first, so a docblock that discusses `overflow-x` is not a declaration
 * of it.
 *
 * Structural, never appearance: which widths the gate shoots a component at,
 * never what it looks like at any of them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_VIEWPORTS_TAG, TIER_VIEWPORTS, TIERS } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The tiers the matrix captures at a single viewport — the only ones where a
 *  width-responsive rule can go unphotographed. Derived from the policy rather
 *  than named here, so promoting a whole tier retires these cases with it. */
const SINGLE_VIEWPORT_TIERS = TIERS.filter((tier) => TIER_VIEWPORTS[tier].length === 1);

/**
 * Declarations that exist to behave differently at different widths.
 *
 * `flex-wrap` and `overflow-x` are the two that reflow silently: neither shows
 * anything at a width with room to spare, and both are the whole answer at a
 * width without it. The queries are matched on `min-width`/`max-width` and
 * `@container` alone.
 */
const WIDTH_RESPONSIVE: readonly RegExp[] = [
  /(?:^|[\s;{])flex-wrap\s*:/,
  /(?:^|[\s;{])overflow-x\s*:/,
  /@media[^{]*\(\s*(?:min|max)-width/,
  /@container\b/,
];

/** One file's text with comments blanked out. */
const codeOf = (file: string) =>
  readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every file under src/, as paths relative to it. */
const filesOnDisk = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((entry) =>
    entry.split(sep).join('/'),
  );

/** Every component whose stylesheet reflows with width, with the tier it is in
 *  and the story module that has to carry the tag. */
const reflowingComponents = () =>
  filesOnDisk()
    .filter(
      (file) =>
        file.endsWith('.css') &&
        SINGLE_VIEWPORT_TIERS.some((tier) => file.startsWith(`${tier}/`)),
    )
    .filter((file) => WIDTH_RESPONSIVE.some((rule) => rule.test(codeOf(file))))
    .map((file) => ({ css: file, stories: file.replace(/\.css$/, '.stories.tsx') }))
    .sort((a, b) => a.css.localeCompare(b.css));

describe('the viewport contract', () => {
  // Without this, every case below passes on an empty list — a renamed suffix or
  // a moved tier would read as "nothing reflows" rather than as a broken scan.
  it('finds the components that reflow with width', () => {
    expect(reflowingComponents().length).toBeGreaterThan(0);
  });

  it.each(reflowingComponents())(
    '$css reflows with width, so $stories is captured at every viewport',
    ({ stories }) => {
      expect(codeOf(stories)).toContain(ALL_VIEWPORTS_TAG);
    },
  );
});

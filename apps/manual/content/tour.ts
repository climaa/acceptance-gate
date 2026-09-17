import type { ManualSlug } from '@/lib/allowlist';

/**
 * The on-boarding lane: five things to do, in the order a newcomer does them.
 *
 * Two lanes meet in every step, and the split is the whole design.
 *
 * `title` and `lede` are authored. Gherkin is written for the gate, and "Then
 * the job form is set to compare those two sets" is not a sentence anybody
 * learns from — so the task is said in the reader's words, and is free to be
 * reworded whenever it reads badly.
 *
 * `scenario` is the anchor, and it is what stops the authored half from
 * lying. Each step names one scenario from a published feature, `lib/tour.ts`
 * renders that scenario's real steps beneath the authored sentence, and a
 * scenario renamed or deleted fails the build rather than leaving a tour step
 * promising behaviour nothing checks.
 *
 * `path` is where in the deployed console the step happens, relative to
 * `CONSOLE_URL`. Every one of them is a position rather than an ask — `mode`,
 * `bucket`, `story` — because the console mirrors those into the address on
 * purpose, and two scenarios say so: "The selected job tab is a link" and "A
 * shared link restores the modal state". Never `cn`: that is the compare ask's
 * nonce, and a link carrying one is a press that already happened in somebody
 * else's tab.
 *
 * Data, not JSX, for the reason `content/intros.ts` gives: a component defined
 * in this app is photographed by nothing, and this module has to stay readable
 * from a node-environment test.
 */
export interface TourStep {
  /** The task, in the reader's words. */
  title: string;
  /** One sentence: what they will do, and what will surprise them. */
  lede: string;
  /** Which published page the anchoring scenario lives on. */
  slug: ManualSlug;
  /** The exact `Scenario:` name. Pinned — `resolveTour` throws if it is gone. */
  scenario: string;
  /** Console-relative. Resolved against `CONSOLE_URL`. */
  path: string;
  /** What the link says. Written per step rather than a shared "Open in the
   *  console", because five identical links are five links a screen-reader
   *  user cannot tell apart in a list. */
  action: string;
}

/**
 * The report every step from `/report` points into is
 * `apps/visual-diff-ui/fixtures/reports/main-2026-08-17__main-2026-08-13` — a
 * real regression this repository shipped and caught (PR #242, the owl-selector
 * prose rhythm), six changed variants. Committed, so the reader following these
 * links sees what this page describes rather than whatever a live instance
 * happened to hold.
 */
const REPORT = '/report/main-2026-08-17__main-2026-08-13';

/** One of that report's six changed variants, by the key that is also the stem
 *  of its shot filenames. `story` opens the modal on it; `mode` picks the
 *  presentation, and slider is the one that shows both shots at once. */
const CHANGED_VARIANT = 'atoms__desktop__light__atoms-prose--default';

/** The page's own title and heading. */
export const TOUR_TITLE = 'Start here';

/** One paragraph, for the same reason the index has one: the reader came to be
 *  shown something, and an essay is not that. */
export const TOUR_LEAD =
  'Five steps through the deployed console, which runs on committed sample data — nothing you click can start a job or delete anything. Each step links you into the real thing, and names the acceptance scenario that makes the step true.';

/** Where to go after the last step. Split so the link sits inside the sentence
 *  rather than trailing it, which is what makes it read as prose. */
export const TOUR_TRAILER = {
  before: 'That is the loop. The',
  link: 'three reference pages',
  after: ' carry every scenario behind it, including the ones no tour step needed.',
} as const;

export const TOUR: readonly TourStep[] = [
  {
    title: 'Open the console',
    lede: 'It opens on what has been photographed so far: a row per screenshot set, carrying the commit and branch behind it and how many stories it holds. This instance is deployed, so every set is a committed sample and nothing you do can change one.',
    slug: 'console',
    scenario: 'The console lists the screenshot sets',
    path: '/',
    action: 'See the sets',
  },
  {
    title: 'Ask for a comparison',
    lede: 'Pick a before and an after, and the job form fills itself from the choice. There is no button to run it here — a deployed console has no checkout to photograph, and it says so rather than drawing a control that cannot work. This is the shape of the ask, not the running of it.',
    slug: 'console',
    scenario: 'Comparing two sets pre-fills the job form',
    path: '/?mode=compare',
    action: 'Set up a comparison',
  },
  {
    title: 'Read the verdict',
    lede: 'A finished comparison opens on its counts — one per bucket, with both sets named above them. Six things moved in this run and a hundred did not, which is the ratio the whole tool exists to make readable.',
    slug: 'report',
    scenario: 'The report summarizes the comparison by bucket',
    path: REPORT,
    action: 'Open a finished report',
  },
  {
    title: 'Look closely at one change',
    lede: 'The comparison opens over the report: before, after, and the diff the run generated, with a slider to move the boundary between them. This link opens it for you — that a link can is a scenario of its own.',
    slug: 'report',
    scenario: 'A shared link restores the modal state',
    path: `${REPORT}?story=${CHANGED_VARIANT}&mode=slider`,
    action: 'Open the comparison',
  },
  {
    title: 'Work through the rest',
    lede: 'Marking a variant reviewed advances a count, and the report will jump you to the next one it has not been told about. That loop, not the pixel threshold, is what decides whether a change lands.',
    slug: 'report',
    scenario: 'Marking a variant reviewed advances the progress',
    path: `${REPORT}?bucket=changed`,
    action: 'Review the six changes',
  },
];

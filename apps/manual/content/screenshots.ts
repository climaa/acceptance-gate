import type { ManualSlug } from '@/lib/allowlist';

export interface ManualScreenshot {
  src: string;
  /** The capture's own pixels, so the figure holds its shape before the image
   *  arrives. Both captures are viewport shots at the same size. */
  width: number;
  height: number;
  /** Descriptive, not decorative: for a reader who cannot see it, this is the
   *  figure. Say what the console is showing, not that it is a screenshot. */
  alt: string;
  /** Printed under the image. Says what to look at, which the alt cannot do
   *  twice without repeating itself to a screen reader. */
  caption: string;
}

/**
 * Hand-taken from the deployed console, which serves committed sample data — so
 * these show the same fixtures anyone following the link will see, not a private
 * capture tree nobody else can reach.
 *
 * Committed rather than generated. Stage 3 carries the better idea: the repo
 * already photographs every story at two viewports and two themes, and images
 * sourced from that pipeline could not go stale either. Until then these are
 * ordinary files, and a console redesign dates them silently — which is the
 * honest cost of having pictures at all.
 *
 * Not every page has one. Sample mode's subject is a badge and two absences, and
 * the console shot below already shows the badge; a second copy of the same
 * image under a different heading would be filler.
 */
export const SCREENSHOTS: Partial<Record<ManualSlug, ManualScreenshot>> = {
  console: {
    src: '/images/console.jpg',
    width: 1280,
    height: 820,
    alt: 'The visual-diff console in sample mode: a panel of three screenshot sets listing branch, date and story count, a compare picker beneath them, and a job form on the right explaining that a deployed instance cannot start a job.',
    caption:
      'The console, deployed. The sample badge is the subject of its own page; the sets panel and the compare picker are what the scenarios below describe.',
  },
  report: {
    src: '/images/report.jpg',
    width: 1280,
    height: 820,
    alt: 'A finished comparison report: both capture sets identified with their commits, the pinned container and browser versions, a row of count chips reading changed 6, added 0, removed 0, errored 0, a11y 0, unchanged 100, and the review controls with progress at 0 of 6.',
    caption:
      'A report opens on its counts. The chips are the buckets, and the row under them is the review loop the scenarios walk through.',
  },
};

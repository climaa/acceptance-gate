/**
 * The console's own copy, in one place: the shell writes it, the tests assert
 * it, and later issues reuse the sample wording where a control has to explain
 * why it is disabled.
 */

export const APP_NAME = 'visual-diff console';

/** The board's brand line — what this app is, and what it deliberately is not. */
export const APP_TAGLINE = 'the CLI is the engine — this page just drives it';

export const APP_DESCRIPTION =
  'Review visual-diff comparisons: capture sets, reports, and the shots behind every verdict.';

/** The sample notice's accessible name and its visible text — one string, so the
 *  two can never drift apart. */
export const SAMPLE_LABEL = 'sample data';

export const SAMPLE_NOTE =
  'a committed sample run — this instance has captured nothing of its own';

/** The 404 page's heading and its `<title>`, and what it says under it. A
 *  reviewer arrives here from a link the console itself drew — a report deleted
 *  since the page was rendered is the ordinary way in — so the copy names that
 *  cause rather than blaming the address. Only a report: it is the one thing in
 *  this app with a URL, so it is the only thing a reader can arrive here
 *  looking for. */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing here — a report deleted since this link was drawn reads exactly like an address that never existed.';

/** The way back, on a page whose whole point is that the reader took a wrong
 *  turn. The shell's wordmark is not a link, so without this there is none. */
export const NOT_FOUND_ACTION = 'Back to the console';

/**
 * What `app/error.tsx` and `app/global-error.tsx` say when a render throws.
 *
 * The console reaches this more readily than most apps do, and on purpose:
 * `lib/data.ts` throws rather than returning null when a summary it was asked
 * for is malformed, so schema drift in a written report surfaces as a failure
 * instead of as an empty screen. This is where that lands.
 *
 * Distinct from the 404's copy because the two answer different questions. A
 * miss says the report is gone; this says the report may well be there and the
 * console could not read it — which is why the way on is the same page again
 * rather than a link back to the index.
 *
 * NO `role="alert"` on the element that carries this. apps/e2e/pages/console.ts
 * matches every console refusal with a strict
 * `getByRole('main').getByRole('alert')`, and a second alert inside `main`
 * fails that locator on every scenario that uses it.
 */
export const ERROR_TITLE = 'Something went wrong';

export const ERROR_NOTE =
  'This view could not be rendered. A report the console failed to read reads the same from here as one that was never written.';

export const ERROR_ACTION = 'Try again';

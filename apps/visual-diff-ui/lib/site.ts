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
 *  cause rather than blaming the address. */
export const NOT_FOUND_TITLE = 'Not found';

export const NOT_FOUND_NOTE =
  'Nothing here — a report or set that has been deleted since this link was drawn reads exactly like an address that never existed.';

/** The way back, on a page whose whole point is that the reader took a wrong
 *  turn. The shell's wordmark is not a link, so without this there is none. */
export const NOT_FOUND_ACTION = 'Back to the console';

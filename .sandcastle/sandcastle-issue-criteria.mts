// Ticking an issue's acceptance criteria from the PR that merged it.
//
// The merger used to run `sed 's/- \[ \]/- [x]/g'` over the issue body once
// the PR merged, which ticked every box — including one the PR body left open
// and marked `(needs human verification)` (merge-prompt.md, Step 2a). The
// issue then read as fully verified when nobody had verified it (#645 → #667).
//
// The rule now: an issue box is ticked only when the merged PR's body ticks
// the same criterion. A criterion the PR left open, or carried with
// `(needs human verification)`, stays open in the issue with one annotation
// naming the PR. A box with no matching PR line is left exactly as it is.
//
// Pure on purpose, like sandcastle-push-hold.mts: the `gh` wiring lives in
// sandcastle-tick-criteria.mts, which the merger runs.

const CHECKBOX = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*?)\s*$/;
const NEEDS_HUMAN = /\(needs human verification[^)]*\)/i;

function withoutNeedsHuman(text: string): string {
  return text.replace(new RegExp(NEEDS_HUMAN.source, 'gi'), '');
}

type Checkbox = { prefix: string; ticked: boolean; middle: string; text: string };

function parseCheckbox(line: string): Checkbox | null {
  const m = CHECKBOX.exec(line);
  if (!m) return null;
  return { prefix: m[1]!, ticked: m[2] !== ' ', middle: m[3]!, text: m[4]! };
}

/** A criterion's identity: its text without annotations, whitespace or case. */
function criterionKey(text: string): string {
  return withoutNeedsHuman(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether the PR ticked the criterion as verified, keyed by criterionKey. */
function prVerdicts(prBody: string): Map<string, boolean> {
  const verdicts = new Map<string, boolean>();
  for (const line of prBody.split('\n')) {
    const box = parseCheckbox(line);
    if (!box) continue;
    const key = criterionKey(box.text);
    if (key) verdicts.set(key, box.ticked && !NEEDS_HUMAN.test(box.text));
  }
  return verdicts;
}

export type TickResult = {
  /** The issue body to write back. Equal to the input when nothing changed. */
  body: string;
  /** Issue criteria the PR left for a human, as written in the issue. */
  leftOpen: string[];
};

/**
 * The issue body with every box ticked that the merged PR ticked, and every
 * box the PR left open annotated ` (needs human verification — #<pr>)` once.
 * Running it again on its own output changes nothing.
 */
export function tickIssueCriteria(
  issueBody: string,
  prBody: string,
  pr: number,
): TickResult {
  const verdicts = prVerdicts(prBody);
  const leftOpen: string[] = [];
  const lines = issueBody.split('\n').map((raw) => {
    // GitHub keeps a body's CRLF line ends; work on the line without its CR.
    const cr = raw.endsWith('\r') ? '\r' : '';
    const line = raw.slice(0, raw.length - cr.length);
    const box = parseCheckbox(line);
    if (!box || box.ticked) return raw;
    const verified = verdicts.get(criterionKey(box.text));
    if (verified === undefined) return raw;
    if (verified) return `${box.prefix}x${box.middle}${box.text}${cr}`;
    leftOpen.push(withoutNeedsHuman(box.text).trim());
    if (NEEDS_HUMAN.test(box.text)) return raw;
    return `${box.prefix} ${box.middle}${box.text} (needs human verification — #${pr})${cr}`;
  });
  return { body: lines.join('\n'), leftOpen };
}

/** The comment the merger closes the issue with. */
export function closingComment(prUrl: string, leftOpen: readonly string[]): string {
  const merged = `Merged via PR ${prUrl}. Completed by Sandcastle.`;
  if (leftOpen.length === 0) return merged;
  const list = leftOpen.map((text) => `- [ ] ${text}`).join('\n');
  return `${merged}\n\nThe PR left these acceptance criteria for a human to verify, so they stay open:\n\n${list}`;
}

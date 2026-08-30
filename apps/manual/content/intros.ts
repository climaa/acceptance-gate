import type { ManualSlug } from '@/lib/allowlist';

/**
 * The authored lane: paragraphs, as plain strings rather than JSX.
 *
 * Deliberately data. It keeps this module free of any component defined inside
 * this app — the capture pipeline photographs Storybook, so a bespoke component
 * here would be photographed by nothing — and it keeps the prose importable by a
 * node-environment test.
 *
 * Nothing here is sync-checked, and that is the division of labour: the rendered
 * scenarios cannot drift because they are read from the source at build time,
 * and this is where wording is free to be improved without touching a file that
 * is a product requirement.
 */
export const INDEX_LEAD: readonly string[] = [
  'The visual-diff console captures screenshots of every component in this repository, compares one capture against another, and shows what moved. This is its manual.',
  'Every page here is built from the acceptance scenarios that decide whether a change may merge. They are not a description of the console written alongside it — they are the requirements themselves, rendered. A scenario cannot change without this manual changing in the same commit.',
  'That fixes the genre, so it is worth stating plainly: this is a behavioural reference with some task framing, not a promised how-to. The console is a local tool with one operator, and the instance linked below runs on committed sample data. If you are here to judge the mechanism rather than to operate the tool, you are the reader these pages expect.',
];

export const INTROS: Record<ManualSlug, readonly string[]> = {
  console: [
    'The console is the front door. It lists the screenshot sets captured so far — each with the branch it came from, how many stories it holds and how large it is — and it starts the jobs that produce and compare them.',
    'The behaviour worth knowing is what happens at the edges. A set held by a registered worktree cannot be deleted, and the console says what holds it rather than failing quietly. Choosing two sets to compare fills the job form for you, and the tab you are on is part of the address, so a comparison you set up survives a reload and a link.',
  ],
  report: [
    'A report is the record of one comparison run: every variant judged against its counterpart, sorted into buckets, with the screenshots behind each verdict. It opens on a summary — a count for every bucket, and both capture sets named above the results.',
    'Most of a report is the review loop. Variants are marked reviewed one at a time, and the page tracks the progress, jumps to the next unreviewed card, hides what is done and filters down to a story by title. The loop is walkable by keyboard, which is a requirement rather than a nicety.',
    'When a difference needs a closer look, the comparison modal opens over it: before, after and the generated diff, a slider to move the boundary between the two, and a blink mode that alternates them. The modal state travels in the URL, so a link carries what you were looking at.',
  ],
  sample: [
    'A deployed console has no data directory to read, so it serves a committed set of fixtures instead, and says so. Every screen fed from those fixtures carries a badge.',
    'Two things change beyond the badge. Starting a job is disabled, with the reason given rather than left to be guessed at. Destructive controls are not disabled — they are absent, because nothing on a public instance should offer to delete files that belong to this repository. A control that cannot work is not drawn.',
  ],
};

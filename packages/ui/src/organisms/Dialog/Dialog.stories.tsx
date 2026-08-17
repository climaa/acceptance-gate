import type { Meta, StoryObj } from '@storybook/react';

import { Dialog } from './Dialog';

/**
 * **Why these stories are `visual-diff:fullpage`.**
 *
 * Every other shot in the corpus is taken of `CAPTURE_TARGET` (`#storybook-root`).
 * This component is `position: fixed; inset: 0` — it contributes *zero height* to
 * that element, exactly as SkipLink's focused state does, so a targeted shot would
 * frame an empty root box while the dialog filled the viewport beside it. Whole-page
 * is the only framing that contains what the story is of.
 *
 * That also makes the mobile capture free: organisms shoot desktop **and** mobile,
 * mobile is 390px, the sheet breakpoint is 768px — so the mobile pair of every story
 * below *is* the bottom-sheet baseline, taken of the same markup with no prop, tag or
 * story of its own. If the sheet ever needed one, the claim in Dialog.tsx would
 * already be false.
 *
 * **Frozen open.** `open` is `true` in the args rather than driven by a trigger: a
 * play function would put the capture behind an interaction, and there are none in
 * this corpus. The enter animations need nothing here either — the differ injects
 * `animation: none !important` before every shot (`FREEZE_CSS` in
 * `packages/visual-diff/src/determinism.mjs`), and all three keyframes are one-shot
 * with no `forwards`, so the frozen frame *is* the resting frame.
 *
 * `inline: false` on the docs page is the other half of `position: fixed`: rendered
 * inline, the overlay would cover the whole autodocs page and lock its scroll. An
 * iframe scopes the viewport it pins itself to. The canvas is unaffected — that view
 * is already an iframe of its own, and the capture reads `/iframe.html` directly.
 */
const meta = {
  title: 'Organisms/Dialog',
  component: Dialog,
  // Spelled out rather than imported from `@gate/visual-diff/policy`, which is
  // where every other visual-diff literal is read from. Storybook indexes CSF
  // statically — `parseTags` rejects anything but a string literal here with
  // "CSF: Expected tag to be string literal", and the build fails outright — so
  // the import is not available at this one position. Dialog.test.tsx asserts
  // this array equals `[FULLPAGE_TAG]`, which puts the drift back under a test
  // rather than under a convention.
  tags: ['visual-diff:fullpage'],
  parameters: { docs: { story: { inline: false, iframeHeight: 480 } } },
  args: {
    open: true,
    // Storybook's arg-less stand-in for the consumer's state setter: these stories
    // are captures, and a dialog that closed itself mid-shot would be one.
    onClose: () => {},
  },
} satisfies Meta<typeof Dialog>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The shape a dialog most often has: a heading, a sentence of consequence, and the
 * two controls that answer it. Both are the caller's — the primitive contributes
 * the close button and nothing else — which is what the pair is here to show.
 */
export const Open: Story = {
  args: {
    label: 'Comparison',
    children: (
      <>
        <h2>Discard this comparison?</h2>
        <p>
          The two captures stay where they are. Only the side-by-side view you opened from
          the report is closed.
        </p>
        <button type="button">Keep it open</button>
      </>
    ),
  },
};

/**
 * Content taller than the sheet. The surface stops short of the top edge — the
 * dimmed page still shows above it, which is what keeps a sheet reading as *over*
 * the page rather than as a new screen — and the overflow scrolls inside the
 * content column, not the page behind it.
 */
export const LongContent: Story = {
  args: {
    label: 'Run details',
    children: (
      <>
        <h2>Run details</h2>
        {/* Fixed, enumerated content rather than a generated list: a capture whose
            body is produced by a loop over `Array.from` is one line of story code
            away from silently changing length. */}
        <p>Baseline captured on the pinned container, candidate on the same tag.</p>
        <p>Two shots per variant, compared for stability before either is kept.</p>
        <p>Antialiasing noise is allowed forty pixels before a variant is called.</p>
        <p>A story with no baseline is reported as added, never accepted quietly.</p>
        <p>A baseline no story claims is reported as an orphan for the same reason.</p>
        <p>Accepting a run restamps the host the corpus was captured on.</p>
        <p>The corpus lives in git, so the budget is on the whole directory.</p>
        <p>An accessibility violation outranks the pixel verdict it arrived with.</p>
      </>
    ),
  },
};

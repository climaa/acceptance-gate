import { FULLPAGE_TAG } from '@gate/visual-diff/policy';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';
import dialogStories from './Dialog.stories';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this every render
// stacks in the same document and `getByRole` matches the previous test's DOM.
afterEach(cleanup);

// The dialog writes to two things `cleanup` does not own: `document.body`'s
// inline style, and whatever had focus when it opened.
afterEach(() => {
  document.body.style.overflow = '';
});

/** Two tab stops of the caller's own, so the trap has both ends to wrap. */
const Body = () => (
  <>
    <button type="button">Discard</button>
    <button type="button">Keep</button>
  </>
);

const openDialog = (props: Partial<Parameters<typeof Dialog>[0]> = {}) =>
  render(
    <Dialog open onClose={() => {}} label="Comparison" {...props}>
      <Body />
    </Dialog>,
  );

const dialog = () => screen.getByRole('dialog', { name: 'Comparison' });
const closeButton = () => screen.getByRole('button', { name: 'close' });

describe('Dialog', () => {
  it('names itself for the accessibility tree with the label it was given', () => {
    openDialog();

    screen.getByRole('dialog', { name: 'Comparison' });
  });

  it('renders nothing at all when closed', () => {
    const { container } = render(
      <Dialog open={false} onClose={() => {}} label="Comparison">
        <Body />
      </Dialog>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('marks the surface modal, so the tree behind it is not offered as content', () => {
    openDialog();

    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('appends a caller-supplied className to the block, never to the surface', () => {
    const { container } = openDialog({ className: 'u-mt-2' });

    expect(container.firstElementChild?.className).toBe('ds-dialog u-mt-2');
    expect(dialog().className).toBe('ds-dialog__surface');
  });
});

describe('the focus trap', () => {
  it('moves focus into the dialog on open', () => {
    openDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'close' }));
  });

  it('has a tab stop of its own, so content with none still traps focus', () => {
    render(
      <Dialog open onClose={() => {}} label="Comparison">
        <p>Nothing focusable here.</p>
      </Dialog>,
    );

    // The close button is rendered by the primitive rather than by the caller,
    // which is what makes "the trap is never empty" a property of the component
    // instead of a rule its consumers have to remember.
    expect(document.activeElement).toBe(closeButton());
  });

  it('wraps Tab from the last focusable round to the first', () => {
    openDialog();
    const keep = screen.getByRole('button', { name: 'Keep' });
    keep.focus();

    fireEvent.keyDown(keep, { key: 'Tab' });

    expect(document.activeElement).toBe(closeButton());
  });

  it('wraps Shift+Tab from the first focusable round to the last', () => {
    openDialog();
    const close = closeButton();
    close.focus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep' }));
  });

  it('leaves a Tab in the middle of the order to the browser', () => {
    openDialog();
    const discard = screen.getByRole('button', { name: 'Discard' });
    discard.focus();

    const handled = fireEvent.keyDown(discard, { key: 'Tab' });

    // `fireEvent` returns false once something called preventDefault. jsdom moves
    // no focus on Tab, so the assertion is that the trap did not either.
    expect(handled).toBe(true);
    expect(document.activeElement).toBe(discard);
  });

  it('returns focus to the element that opened it', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const { rerender } = render(
      <Dialog open onClose={() => {}} label="Comparison">
        <Body />
      </Dialog>,
    );
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <Dialog open={false} onClose={() => {}} label="Comparison">
        <Body />
      </Dialog>,
    );

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('dismissal', () => {
  it('calls onClose exactly once on Escape', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose exactly once when the close button is pressed', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.click(closeButton());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stops listening for Escape once closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog open onClose={onClose} label="Comparison">
        <Body />
      </Dialog>,
    );

    rerender(
      <Dialog open={false} onClose={onClose} label="Comparison">
        <Body />
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('is not dismissed by a key that means nothing to it', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the bottom sheet', () => {
  const grabber = () => {
    const found = dialog().querySelector('.ds-dialog__grabber');
    if (!found) throw new Error('the sheet has no grabber');
    return found;
  };

  it('keeps the grabber out of the accessibility tree — it is one presentation’s affordance', () => {
    openDialog();

    expect(grabber().getAttribute('aria-hidden')).toBe('true');
  });

  it('dismisses on a downward swipe of the grabber', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.pointerDown(grabber(), { clientY: 100 });
    fireEvent.pointerUp(grabber(), { clientY: 200 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses nothing on a drag that ends where it started', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.pointerDown(grabber(), { clientY: 100 });
    fireEvent.pointerUp(grabber(), { clientY: 108 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses nothing on an upward swipe', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.pointerDown(grabber(), { clientY: 300 });
    fireEvent.pointerUp(grabber(), { clientY: 100 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('forgets a cancelled gesture rather than resolving it on the next release', () => {
    const onClose = vi.fn();
    openDialog({ onClose });

    fireEvent.pointerDown(grabber(), { clientY: 100 });
    fireEvent.pointerCancel(grabber());
    fireEvent.pointerUp(grabber(), { clientY: 300 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the role and the accessible name across the gesture the sheet owns', () => {
    // The sheet is presentation: nothing about it — not the grabber, not a
    // swipe that travels and cancels — may swap the role or drop the name.
    openDialog();

    fireEvent.pointerDown(grabber(), { clientY: 100 });
    fireEvent.pointerUp(grabber(), { clientY: 110 });

    expect(screen.getAllByRole('dialog', { name: 'Comparison' })).toHaveLength(1);
  });
});

/**
 * The same tag set `apps/e2e/steps/a11y.steps.ts` scans with, so "the comparison
 * modal has no accessibility violations" means one thing whether it is asserted
 * on this component in jsdom or on the deployed page in Chromium. This half runs
 * on every commit; the e2e half (#284/#285) runs against real layout, and rules
 * that need it — colour contrast, above all — are reported `incomplete` here
 * rather than passed. Neither half is the whole claim.
 */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

describe('accessibility', () => {
  it('renders an open dialog with zero axe violations', async () => {
    const { container } = openDialog();

    const results = await axe.run(container, { runOnly: AXE_TAGS });

    // Rule ids, not a whole-object diff: a red CI job has to name what broke.
    const summary = results.violations
      .map((v) => `${v.id} (${v.nodes.length})`)
      .join(', ');
    expect(results.violations, `accessibility violations: ${summary}`).toEqual([]);
  });
});

describe('the capture contract', () => {
  it('tags its stories fullpage, with the string policy.mjs declares', () => {
    // The one place in the repo a visual-diff literal is written out: Storybook
    // indexes CSF statically and rejects a non-literal tag, so Dialog.stories.tsx
    // cannot import it. This is that import, moved to where it can still fail —
    // a targeted shot of a `position: fixed` dialog frames an empty root box, and
    // nothing else in the pipeline would say so.
    expect(dialogStories.tags).toEqual([FULLPAGE_TAG]);
  });
});

describe('body scroll', () => {
  it('locks the page behind while the dialog is open', () => {
    openDialog();

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('gives the page back whatever overflow it had before', () => {
    document.body.style.overflow = 'clip';
    const { rerender } = render(
      <Dialog open onClose={() => {}} label="Comparison">
        <Body />
      </Dialog>,
    );

    rerender(
      <Dialog open={false} onClose={() => {}} label="Comparison">
        <Body />
      </Dialog>,
    );

    expect(document.body.style.overflow).toBe('clip');
  });
});

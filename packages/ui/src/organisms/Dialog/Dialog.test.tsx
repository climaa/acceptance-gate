import { FULLPAGE_TAG } from '@gate/visual-diff/policy';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog, type DialogProps } from './Dialog';
import dialogStories from './Dialog.stories';

// `globals` is off in vitest.config.ts, so Testing Library never sees a global
// `afterEach` to hook its automatic cleanup onto — without this every render
// stacks in the same document and `getByRole` matches the previous test's DOM.
afterEach(cleanup);

// `document.body`'s inline style is the one thing the dialog writes that
// `cleanup` does not own: unmounting restores the value the *test* left there,
// which is only `''` for the tests that did not set one.
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

/**
 * The dialog as every test below renders it, with whichever props that test is
 * about overridden. Closing one is `rerender(dialogWith({ open: false }))` —
 * the same element with the same children, which is what makes it a close
 * rather than a fresh render of a different tree.
 */
const dialogWith = ({ children = <Body />, ...props }: Partial<DialogProps> = {}) => (
  <Dialog open onClose={() => {}} label="Comparison" {...props}>
    {children}
  </Dialog>
);

const openDialog = (props: Partial<DialogProps> = {}) => render(dialogWith(props));

const dialog = () => screen.getByRole('dialog', { name: 'Comparison' });
const closeButton = () => screen.getByRole('button', { name: 'close' });

/**
 * The dialog's outermost node, found from the document rather than from the
 * render container — which is the whole point of the portal, and so cannot be
 * assumed by the helper that looks for it.
 */
const dialogRoot = () => document.querySelector('.ds-dialog');

describe('Dialog', () => {
  it('names itself for the accessibility tree with the label it was given', () => {
    openDialog();

    screen.getByRole('dialog', { name: 'Comparison' });
  });

  it('renders nothing at all when closed', () => {
    const { container } = render(dialogWith({ open: false }));

    // Both halves, because the portal makes the first half true on its own: an
    // open dialog also leaves the container empty, and only the document can
    // say whether the surface exists at all.
    expect(container.innerHTML).toBe('');
    expect(dialogRoot()).toBeNull();
  });

  it('marks the surface modal, so the tree behind it is not offered as content', () => {
    openDialog();

    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('appends a caller-supplied className to the block, never to the surface', () => {
    openDialog({ className: 'u-mt-2' });

    expect(dialogRoot()?.className).toBe('ds-dialog u-mt-2');
    expect(dialog().className).toBe('ds-dialog__surface');
  });
});

/**
 * The dialog renders through `createPortal` into `document.body`, not where the
 * consumer mounted it.
 *
 * `aria-modal="true"` is the claim the portal makes true. Nothing outside the
 * surface is `inert` or `aria-hidden`, so a dialog rendered inline sits *inside*
 * the tree it says is not content — and every announcement it makes joins that
 * tree's own. A landmark already announcing something and a confirmation
 * refusing for that same reason then held two alerts between them, which is
 * reachable by the ordinary path whenever one condition draws both (#319).
 */
describe('the portal', () => {
  it('renders outside the tree the consumer mounted it in', () => {
    const { container } = openDialog();

    expect(container.innerHTML).toBe('');
    expect(dialogRoot()?.parentElement).toBe(document.body);
  });

  it('keeps an alert of its own out of the landmark it was opened from', () => {
    render(
      <main>
        <p role="alert">a job is already running</p>
        {dialogWith({ children: <p role="alert">a job is already running</p> })}
      </main>,
    );

    const main = screen.getByRole('main');

    // One, not two: the page's own alert. The dialog's is announced from
    // outside it, which is what lets a strict landmark-scoped lookup survive
    // both being on screen at once.
    expect(within(main).getAllByRole('alert')).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});

describe('the focus trap', () => {
  it('moves focus into the dialog on open', () => {
    openDialog();

    expect(document.activeElement).toBe(closeButton());
  });

  it('has a tab stop of its own, so content with none still traps focus', () => {
    render(dialogWith({ children: <p>Nothing focusable here.</p> }));

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

    const { rerender } = openDialog();
    expect(document.activeElement).not.toBe(trigger);

    rerender(dialogWith({ open: false }));

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
    const { rerender } = openDialog({ onClose });

    rerender(dialogWith({ open: false, onClose }));
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
    openDialog();

    // `document.body`, not the render container: the surface is portalled out of
    // it, so scanning the container would scan an empty div and pass on nothing.
    const results = await axe.run(document.body, { runOnly: AXE_TAGS });

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
    const { rerender } = openDialog();

    rerender(dialogWith({ open: false }));

    expect(document.body.style.overflow).toBe('clip');
  });
});

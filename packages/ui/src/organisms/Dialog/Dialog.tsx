'use client';

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';

export interface DialogProps {
  /** Closed renders nothing — there is no hidden copy of the dialog in the page. */
  open: boolean;
  /**
   * Called by both dismissals — `Escape` and the close button — and by the
   * sheet's swipe. The dialog never closes itself: `open` stays the caller's.
   */
  onClose: () => void;
  /**
   * The dialog's accessible name, and its only one. Consumers are found by it —
   * `getByRole('dialog', { name: 'Confirm deletion' })` — so it says what the
   * dialog is for rather than what it looks like.
   */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Tab stops, in document order. Deliberately not filtered for visibility:
 * everything inside the surface is rendered by the caller and on screen, and a
 * filter that guessed would drop a control the trap has to keep.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusablesIn = (surface: HTMLElement) => [
  ...surface.querySelectorAll<HTMLElement>(FOCUSABLE),
];

/**
 * The wrap half of the trap. `Tab` leaves the trap from the last stop and
 * `Shift+Tab` from the first; each wraps to the other end, and every `Tab` in
 * between is left to the browser so the order inside stays the document's.
 */
const wrapTab = (surface: HTMLElement, event: KeyboardEvent) => {
  const stops = focusablesIn(surface);
  const first = stops[0];
  const last = stops.at(-1);
  const leavingFrom = event.shiftKey ? first : last;
  const wrapTo = event.shiftKey ? last : first;

  if (!wrapTo || surface.ownerDocument.activeElement !== leavingFrom) return;

  event.preventDefault();
  wrapTo.focus();
};

/** Downward travel on the grabber, in CSS pixels, that reads as "dismiss". */
const SWIPE_DISMISS_PX = 56;

/**
 * The sheet's swipe, as the three handlers the grabber spreads. Start and end
 * only — no move handler, so the sheet does not follow the finger. A drag that
 * travels down and comes back up ends where it started and dismisses nothing,
 * which is the whole of the cancel gesture.
 *
 * Where the gesture began is a ref rather than state: nothing rendered reads it,
 * so a re-render per pointer event would redraw the surface to record something
 * only the next pointer event will look at.
 */
const useSwipeDismiss = (onDismiss: () => void) => {
  const grabbedAt = useRef<number | null>(null);

  return {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      grabbedAt.current = event.clientY;
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      const from = grabbedAt.current;

      grabbedAt.current = null;
      if (from !== null && event.clientY - from >= SWIPE_DISMISS_PX) onDismiss();
    },
    onPointerCancel: () => {
      grabbedAt.current = null;
    },
  };
};

/**
 * The system's modal surface: `role="dialog"` over a dimmed backdrop, focus
 * trapped inside it while it is open and returned to whatever opened it when it
 * closes.
 *
 * Below 768px the same component presents as a bottom sheet — grabber bar,
 * anchored to the bottom edge, controls within the thumb's reach. **That is
 * presentation and nothing else**: no prop selects it and no state records it,
 * the media query in Dialog.css does. The role, the accessible name, the trap
 * and the close button are the same markup in both — the swipe is a
 * convenience, the button is the accessible path.
 *
 * The backdrop is not a dismissal. Two ways out, both deliberate and both
 * announced; a click that lands anywhere outside is neither, and a confirm
 * dialog naming what it is about to delete is exactly the place a mis-click
 * must not resolve.
 */
export function Dialog({ open, onClose, label, children, className }: DialogProps) {
  // Everything the dialog does while it exists — the trap, the key listener, the
  // scroll lock — belongs to a component that only exists while it does. Guarding
  // each of those effects on `open` instead would leave the mounted/not-mounted
  // question answered in four places.
  if (!open) return null;

  return (
    <DialogSurface onClose={onClose} label={label} className={className}>
      {children}
    </DialogSurface>
  );
}

function DialogSurface({
  onClose,
  label,
  children,
  className,
}: Omit<DialogProps, 'open'>) {
  // A state node rather than a ref: the effects below need to run *once the
  // surface exists*, and a ref's mutation is not a dependency React can see.
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const swipeToDismiss = useSwipeDismiss(onClose);

  // Focus in on open, back out on close. The opener is read at the moment the
  // surface appears and restored from the cleanup, so an unmount while open
  // returns focus too — a route change is as much a close as Escape is.
  useEffect(() => {
    if (!surface) return;

    const opener = surface.ownerDocument.activeElement;
    (focusablesIn(surface)[0] ?? surface).focus();

    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [surface]);

  // On the document rather than on the surface: focus can legitimately sit on
  // <body> — after a click on the backdrop, say — and a handler bound to the
  // surface would never see the Escape that follows.
  useEffect(() => {
    if (!surface) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (event.key === 'Tab') wrapTab(surface, event);
    };

    const doc = surface.ownerDocument;
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [surface, onClose]);

  // The page behind must not scroll under the sheet. Restored to whatever was
  // there before rather than to `''`, so a consumer that locks the body itself
  // gets its own value back.
  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;

    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  return (
    <div className={['ds-dialog', className].filter(Boolean).join(' ')}>
      <div className="ds-dialog__backdrop" />

      <div
        ref={setSurface}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // Focusable only as a fallback: a dialog whose content has no tab stop
        // still has to be able to receive focus, or the trap has nowhere to put
        // it and the reader is left outside the thing they opened.
        tabIndex={-1}
        className="ds-dialog__surface"
      >
        {/* Out of the accessibility tree on purpose: a pointer affordance for one
            presentation. The close button below is the path every reader has, in
            both presentations. */}
        <div aria-hidden="true" className="ds-dialog__grabber" {...swipeToDismiss}>
          <span className="ds-dialog__grabber-bar" />
        </div>

        <div className="ds-dialog__header">
          <button
            type="button"
            aria-label="close"
            className="ds-dialog__close"
            onClick={onClose}
          >
            {/* The glyph is decorative — `aria-label` above is the whole name. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="ds-dialog__content">{children}</div>
      </div>
    </div>
  );
}

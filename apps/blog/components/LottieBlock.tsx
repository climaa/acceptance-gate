'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';

/**
 * The player, split out of the route bundle.
 *
 * `ssr: false` because the renderer is a WebAssembly canvas: there is nothing
 * for it to produce on the server, and asking would only move the failure. The
 * dynamic boundary is what keeps ~480 KB of renderer and wasm out of the
 * initial JavaScript for every reader of every page — checked in `next build`'s
 * route output, which is the only place that claim is actually true or false.
 *
 * `loading` is null rather than a placeholder: the still is already on screen
 * underneath, and a second placeholder over it would be a flash.
 */
const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((mod) => mod.DotLottieReact),
  { ssr: false, loading: () => null },
);

/** How far outside the viewport the player starts loading. */
const PRELOAD_MARGIN = '200px';

export interface LottieBlockProps {
  /** The `.lottie`, served from `public/` — never a CDN on a page's critical path. */
  src: string;
  /**
   * The still, shown before the player has drawn and instead of it under
   * reduced motion. Required, not optional: a block with no still has a hole in
   * it for every reader who has asked for less movement.
   */
  still: ReactNode;
  /** The square the box occupies, in pixels. Fixed, so nothing reflows around it. */
  size: number;
  /** The state machine to load and start once the file is in, if the file has one. */
  stateMachineId?: string;
  /** Handed the instance once it has loaded and its machine has started. */
  onReady?: (dotLottie: DotLottie) => void;
  /** Handed nothing; called when the instance goes away, so a holder can drop it. */
  onTeardown?: () => void;
  className?: string;
}

/**
 * Whether this reader has asked for less movement.
 *
 * Starts `false` — meaning "assume reduced" — so the first render is the still
 * on the server, in the markup, and for anyone whose preference we have not yet
 * been able to read. Moving to the player is a decision made once the browser
 * has actually been asked; moving to the still is never a decision at all.
 *
 * Live, not read once. Changing the OS setting flips this without a reload,
 * which is what someone toggling it to check the page expects to see.
 */
function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setAllowed(!query.matches);

    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return allowed;
}

/** Whether the box has come within `PRELOAD_MARGIN` of the viewport yet. */
function useNearViewport(host: React.RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element || near) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Latched, never unlatched: once the chunk has been fetched there is
        // nothing to gain by unmounting the player when the box scrolls off,
        // and doing so would re-run its load — and reset its state machine —
        // every time the reader scrolled past.
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: PRELOAD_MARGIN },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [host, near]);

  return near;
}

/**
 * A dotLottie animation in a fixed box, with a still underneath it.
 *
 * Generic on purpose — it knows about loading, motion preference and the box,
 * and nothing about what the animation means. What the states stand for and
 * when they change is the caller's, through `onReady`.
 *
 * The still and the canvas are stacked rather than swapped, and the still is
 * hidden on the player's own `load` rather than on the chunk resolving: the
 * component being mounted says the code arrived, not that a frame has been
 * drawn. Hiding on the earlier signal leaves a blank square for however long
 * the wasm takes to come up.
 */
export function LottieBlock({
  src,
  still,
  size,
  stateMachineId,
  onReady,
  onTeardown,
  className,
}: LottieBlockProps) {
  const host = useRef<HTMLDivElement>(null);
  const motionAllowed = useMotionAllowed();
  const near = useNearViewport(host);
  const [drawn, setDrawn] = useState(false);

  // Read through a ref inside the instance callback so a caller passing an
  // inline function does not tear down and rebuild the player on every render.
  // Written in an effect, never during render: a ref write is a side effect,
  // and the callbacks are only ever read from the player's own events, which
  // happen long after the commit.
  const callbacks = useRef({ onReady, onTeardown });

  useEffect(() => {
    callbacks.current = { onReady, onTeardown };
  });

  const handleInstance = (dotLottie: DotLottie | null) => {
    if (!dotLottie) {
      setDrawn(false);
      callbacks.current.onTeardown?.();
      return;
    }

    dotLottie.addEventListener('load', () => {
      // Loading and starting the machine here rather than through the
      // `stateMachineId` prop: that prop's effect is guarded on `isLoaded` and
      // runs on mount, which for a file still being fetched is a no-op that
      // never retries. This runs on the event that means the file is in.
      //
      // Both answers are READ, and that is the difference between `drawn`
      // meaning "the file arrived" and meaning "the animation is running". They
      // are the same thing almost always, and when they are not — a machine that
      // failed to start — hiding the still would swap a correct, themed drawing
      // for a canvas frozen on whatever frame it happened to hold. The still is
      // the better answer in that case, so it stays and the caller is never
      // handed an instance it cannot drive.
      if (stateMachineId) {
        const running =
          dotLottie.stateMachineLoad(stateMachineId) && dotLottie.stateMachineStart();
        if (!running) return;
      }

      setDrawn(true);
      callbacks.current.onReady?.(dotLottie);
    });
  };

  const showPlayer = motionAllowed && near;

  return (
    <div
      ref={host}
      className={className}
      style={{ width: size, height: size }}
      data-lottie-drawn={drawn ? 'true' : 'false'}
    >
      {/* `hidden` rather than unmounted: removing the still on the frame the
          canvas starts drawing is a swap the eye catches, and keeping it in the
          tree costs one element. */}
      <div className="lottie-block__still" hidden={drawn}>
        {still}
      </div>

      {showPlayer && (
        <div className="lottie-block__player">
          <DotLottieReact
            src={src}
            autoplay={false}
            dotLottieRefCallback={handleInstance}
            /* The canvas takes no pointer events at all, and this is load-
               bearing rather than tidy.

               `dotlottie-web` reads the file's declared interactions
               (`stateMachineGetListeners`) and wires a real DOM listener onto
               the canvas for each one — `click` included. The shipped
               `changelog-sync.lottie` still declares `Click`, and its `s-synced`
               state transitions on `click`, so a press on an already-open
               conversation would drive the machine straight from the check mark
               back into the syncing loop: the icon animating a load that is not
               happening, behind the back of the component whose entire job is
               deciding what a press means.

               Measured, not assumed. With the canvas inert
               `document.elementFromPoint` at the icon's centre returns the
               wrapper inside the button; with pointer events restored it
               returns the canvas, which is the event path that would fire the
               file's own interaction.

               So every input arrives through the button instead, which is also
               what makes the keyboard path and the mouse path one path rather
               than two that have to be kept in step.

               The asset has since been re-exported without its `Click`
               interaction, and this stays. It is not a workaround for that one
               interaction: it is what makes this component the ONLY thing
               driving the machine, so a future export that declares a pointer
               interaction again cannot quietly take the wheel. `PointerEnter`
               and `PointerExit` are still declared today and are fired from the
               button, which is why the keyboard gets them too. */
            style={{ pointerEvents: 'none' }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

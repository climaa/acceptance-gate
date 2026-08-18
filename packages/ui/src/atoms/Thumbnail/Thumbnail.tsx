'use client';

import { type ReactNode, useState } from 'react';

// Directly, never through `../index` — reaching a sibling atom through the tier
// barrel is the same boundaries violation as importing a later tier.
import { Skeleton } from '../Skeleton/Skeleton';

export interface ThumbnailProps {
  /** Absent means there is nothing to show — the fallback stands in its place. */
  src?: string;
  alt: string;
  /** What to draw when there is no image. Content comes from the consumer:
   *  copy like "not on this side" is the caller's vocabulary, not the system's. */
  fallback?: ReactNode;
  className?: string;
}

/** What the browser has told us about one particular `src`. */
interface Observed {
  src: string;
  status: 'loaded' | 'error';
}

/**
 * An image in a frame, with the two states an image has before it is one: a
 * placeholder while it arrives, and the caller's fallback when it never does.
 *
 * The observation is stored against the `src` it was made for rather than as a
 * bare status, so a new `src` returns to loading on the render that introduces
 * it — no effect, and no frame in which the previous image's `load` is read as
 * this one's.
 *
 * The `<img>` is mounted from the first render, hidden by a class rather than
 * conditionally rendered: it is the element that fetches, and the element whose
 * `load` retires the placeholder. Nothing swaps in afterwards, so the frame does
 * not reflow at the moment the image appears.
 *
 * The element is also *asked* on mount, not only listened to. An image whose
 * bytes are already cached can finish before React attaches `onLoad` — a
 * revisit, a soft navigation, anything served `immutable` — and an event fired
 * before its handler existed is an event that never arrives, leaving the frame
 * showing its placeholder for an image that is sitting right there.
 */
export function Thumbnail({ src, alt, fallback, className }: ThumbnailProps) {
  const [observed, setObserved] = useState<Observed | null>(null);

  /** What the element already knows, for the load that beat the listener. A
   *  decoded image reports a natural width; a broken one reports zero.
   *
   *  The observation is recorded against the `src` prop this render passed
   *  rather than the element's resolved URL — a relative `src` comes back off
   *  the DOM absolute, and the two would never compare equal. The previous
   *  object is returned unchanged when it already says this, because an inline
   *  ref is re-invoked on every render and a fresh object each time would be a
   *  render loop. */
  const readOnMount = (node: HTMLImageElement | null) => {
    if (!node?.complete || src === undefined) return;

    const status: Observed['status'] = node.naturalWidth > 0 ? 'loaded' : 'error';

    setObserved((current) =>
      current?.src === src && current.status === status ? current : { src, status },
    );
  };

  const status = src !== undefined && observed?.src === src ? observed.status : 'loading';
  const frameClass = ['ds-thumbnail', className].filter(Boolean).join(' ');

  if (src === undefined || status === 'error') {
    return (
      <span className={frameClass}>
        <span className="ds-thumbnail__fallback">{fallback}</span>
      </span>
    );
  }

  const pending = status === 'loading';

  return (
    <span className={frameClass}>
      {pending && <Skeleton variant="block" />}
      <img
        className={['ds-thumbnail__img', pending && 'ds-thumbnail__img--pending']
          .filter(Boolean)
          .join(' ')}
        ref={readOnMount}
        src={src}
        alt={alt}
        onLoad={() => setObserved({ src, status: 'loaded' })}
        onError={() => setObserved({ src, status: 'error' })}
      />
    </span>
  );
}

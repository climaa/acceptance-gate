import type { ReactNode } from 'react';

export interface SkipLinkProps {
  /** Id (without the leading `#`) of the element to jump to. Defaults to `main`. */
  targetId?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * The first tab stop: visually hidden until it receives focus, but always
 * present in the accessibility tree — a keyboard user tabs to it before
 * anything else and jumps past the header nav straight to the main content.
 *
 * `.ds-visually-hidden` (styles.css) does the hiding; `.ds-skip-link` only
 * adds the `:focus-visible` reveal, so the clip-rect pattern stays declared
 * in one place for every future consumer of that utility.
 */
export function SkipLink({ targetId = 'main', className, children }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={['ds-visually-hidden', 'ds-skip-link', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children ?? 'Skip to content'}
    </a>
  );
}

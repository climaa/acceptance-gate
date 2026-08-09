export type SkeletonVariant = 'line' | 'block';

/** The space scale from tokens.css. A size is a step, never a length: the escape
 *  hatch exists so a caller can shape a placeholder, not so it can state a value
 *  the theme cannot retune. */
export type SkeletonSpace = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: SkeletonSpace;
  height?: SkeletonSpace;
  /** Renders this many stacked shapes instead of one. `0` renders nothing. */
  lines?: number;
  className?: string;
}

const spaceToken = (step: SkeletonSpace | undefined) =>
  step === undefined ? undefined : `var(--space-${step})`;

/**
 * Loading placeholder. The shimmer is entirely CSS — see the `.ds-skeleton` block
 * in styles.css, which also documents the frame it freezes on when a capture
 * pauses animations.
 *
 * Every shape is `aria-hidden`: a placeholder has no content, so a reader that
 * reaches it announces an empty box. Marking the region busy is the consumer's
 * call — an atom cannot know the bounds of the region it stands in, and one live
 * region per placeholder would announce N times for one load.
 *
 * The stacked-lines case does not compose `Stack`, though it is the obvious
 * layout for it: `boundaries/dependencies` disallows an atom importing a sibling
 * atom, and reaching through the barrel is named in the eslint config as the same
 * violation. `.ds-skeleton-group` therefore states the two declarations `Stack`
 * would have produced.
 */
export function Skeleton({
  variant = 'line',
  width,
  height,
  lines,
  className,
}: SkeletonProps) {
  // One shape, whether it stands alone or inside a group: `key` is set only in the
  // group, and the caller's className lands on whichever element is the root.
  const shape = (key: number | undefined, extra?: string) => (
    <span
      key={key}
      className={['ds-skeleton', `ds-skeleton--${variant}`, extra]
        .filter(Boolean)
        .join(' ')}
      style={{ width: spaceToken(width), height: spaceToken(height) }}
      aria-hidden="true"
    />
  );

  if (lines === undefined) return shape(undefined, className);

  if (lines <= 0) return null;

  return (
    <span className={['ds-skeleton-group', className].filter(Boolean).join(' ')}>
      {Array.from({ length: lines }, (_, index) => shape(index))}
    </span>
  );
}

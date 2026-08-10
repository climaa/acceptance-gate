import { Prose, Skeleton, Stack } from '@gate/ui';

/**
 * Mirrors PostTemplate's shape: the header block (title, meta, tags) at the
 * container's width, then body lines constrained to `--width-prose` inside
 * `Prose`, exactly as the real article body is.
 */
export default function Loading() {
  return (
    <Stack as="article" gap={8} className="ds-post-template">
      <Stack as="header" gap={3}>
        <Skeleton variant="block" height={10} className="ds-post-template__title" />
        <Skeleton width={12} />
        <Stack direction="row" gap={2} wrap>
          <Skeleton width={4} />
          <Skeleton width={4} />
          <Skeleton width={4} />
        </Stack>
      </Stack>
      <Prose>
        <Skeleton lines={6} />
      </Prose>
    </Stack>
  );
}

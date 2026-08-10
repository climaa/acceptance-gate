import { Card, Skeleton, Stack } from '@gate/ui';

/**
 * Mirrors PostCard's shape — title, description, meta line and a tag row
 * inside the same Card shell. Geometry only: a placeholder has no content, so
 * nothing here states a colour or a size the differ doesn't already own.
 */
function PostCardSkeleton() {
  return (
    <Card>
      <Stack gap={2}>
        <Skeleton height={5} />
        <Skeleton lines={2} />
        <Skeleton width={10} />
        <Stack direction="row" gap={2} wrap>
          <Skeleton width={4} />
          <Skeleton width={4} />
        </Stack>
      </Stack>
    </Card>
  );
}

/**
 * Mirrors BlogIndexTemplate's shape — a heading block above three
 * card-shaped placeholders — shared by `/blog` and `/tags/[tag]`, the two
 * routes it renders under.
 */
export function BlogIndexLoading() {
  return (
    <Stack gap={8} className="ds-blog-index">
      <Stack gap={2}>
        <Skeleton
          variant="block"
          height={10}
          width={16}
          className="ds-blog-index__title"
        />
      </Stack>
      <Stack gap={3} className="ds-blog-index__list">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </Stack>
    </Stack>
  );
}

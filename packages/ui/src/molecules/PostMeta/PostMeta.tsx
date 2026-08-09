export interface PostMetaProps {
  /** ISO `YYYY-MM-DD` date string; also carried verbatim on `<time dateTime>`. */
  date: string;
  readingMinutes: number;
  className?: string;
}

// Formatted in a fixed 'en-US' locale rather than the runtime's default: the same
// ISO date must render the same string in CI as it does locally, or a later
// visual-diff baseline goes stale for no code reason. UTC pins the day/month
// boundary so a post dated the 1st of a month can't roll back to the last day of
// the previous one in a negative-offset timezone.
function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function PostMeta({ date, readingMinutes, className }: PostMetaProps) {
  return (
    <div className={['ds-post-meta', className].filter(Boolean).join(' ')}>
      <time dateTime={date}>{formatPostDate(date)}</time>
      <span aria-hidden="true">·</span>
      <span>{readingMinutes} min</span>
    </div>
  );
}

/**
 * When a committed measurement stops describing the repository. Nothing measures
 * on a schedule: the file is as old as the last time someone ran
 * `pnpm census:measure`, so the page says so once it is older than this.
 */
export const STALE_AFTER_DAYS = 14;

const DAY_MS = 86_400_000;

/** Whole days between `measuredAt` and `now`, rounded down. */
export function ageInDays(measuredAt: string, now: number): number {
  return Math.floor((now - Date.parse(measuredAt)) / DAY_MS);
}

/** Older than {@link STALE_AFTER_DAYS}; exactly fourteen days is still fresh. */
export function isStale(measuredAt: string, now: number): boolean {
  return now - Date.parse(measuredAt) > STALE_AFTER_DAYS * DAY_MS;
}

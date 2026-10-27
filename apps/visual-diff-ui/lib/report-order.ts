/** Code-unit order, descending — a deterministic order, not a date order: an id
 *  can lead with `baselines` as well as a dated label. The reports table puts
 *  them in run order (ReportsTable's `byRunDate`), from the history it holds.
 *
 *  Its own module because it is pure: `lib/data.ts` sorts the report ids it
 *  lists with it, and a screen story sorts the same fixtures without `fs`. */
export function newestFirst(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

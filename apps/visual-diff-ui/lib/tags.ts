/**
 * The cache tags the console's readers register, and the window a purge leaves.
 *
 * A leaf module with no `next/*` import, because both halves of the app need
 * these names: lib/data.ts registers them on its readers, and lib/jobs.ts
 * records which of them a finished job made stale. Keeping them here means the
 * write path does not have to import the read path for four strings.
 */

/** Revalidation handles for the readers in lib/data.ts; every mutation purges
 *  the ones it moved. */
export const SETS_TAG = 'vd:sets';
export const REPORTS_TAG = 'vd:reports';
export const reportTag = (id: string) => `vd:report:${id}`;

/**
 * How long an entry a mutation invalidated may still be served: not at all.
 *
 * `revalidateTag` takes that window as its second argument, and this app's answer
 * is the same for every tag — a deleted set is not "a bit stale", it is gone, and
 * the list that still names it is wrong rather than old. (`updateTag`, which
 * expires immediately by definition, is Server-Action-only and throws in a route
 * handler — see `__tests__/config.test.ts`.)
 */
export const PURGE = { expire: 0 };

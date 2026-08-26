/**
 * The console's one re-read of the server, and the order it happens in.
 *
 * Every table on this page is server-rendered, so two unrelated things end in
 * `router.refresh()`: a mutation, because the row it changed is drawn by the
 * server, and the job poller, because a run that finished wrote a history row
 * and maybe a report and a set. Until this module existed those two decided
 * independently, and the window where they overlap is the ordinary rhythm of
 * using the console — finishing a compare is exactly when a reviewer tidies up.
 *
 * Overlapping is what breaks. The poller's refresh reads the tables at the
 * moment it is issued; if that is before a DELETE has come back, it is carrying
 * a row the reviewer has already removed. And there is no later refresh to
 * correct it: the poller re-reads once per job id and then backs off to
 * `MAX_IDLE_POLL_MS`, so the stale row is not flickering — it is stuck until
 * somebody reloads.
 *
 * So the page has an owner while a mutation is in flight. A mutation HOLDS it
 * for the length of the request and gives it back afterwards; anything else that
 * wants the page re-read while it is held is deferred to that release rather
 * than run beside it. Nothing is lost — a deferred request is a promise that the
 * page WILL be read again, and the read that keeps it is the mutation's, which
 * by then has the server's answer to the mutation in it.
 *
 * What this does NOT do is reach a refresh already dispatched. A poller that
 * asked while the page was free, and a delete the reviewer starts a moment
 * later, still leave one read spanning the other's request. That ordering is
 * Next's to keep and it does: `ACTION_REFRESH` is not a navigation, so
 * `dispatchAction` appends it to the router's action queue and
 * `runRemainingActions` starts it only once the one before it settles
 * (`next/dist/client/components/app-router-instance.js`). Dispatch order is run
 * order, and the mutation's read is always dispatched last — after its own
 * response. What the queue cannot help with is two owners deciding to read at
 * once, which is the half this module removes.
 *
 * Module state rather than a context, deliberately. This is a property of the
 * document — there is one page and one router behind it — and the two callers
 * sit in subtrees with no client component between them: the delete dialogs are
 * in the console's left column, the poller in its right. A provider over both
 * would be a client boundary drawn around the whole dashboard to carry two
 * numbers.
 */

/** A re-read of the page: `router.refresh()`, handed in rather than imported,
 *  because this module has no hooks in it and the router is a hook's answer. */
export type Refresh = () => void;

/** How many mutations are in flight. A count, not a flag: the run panel and a
 *  delete dialog are separate components and nothing stops a reviewer starting
 *  one while the other is open. */
let held = 0;

/** Whether something asked for the page while it was held, and is owed a read. */
let owed = false;

/**
 * Ask for the page to be read again — the poller's path.
 *
 * Runs now when nothing holds the page, which is every call outside the overlap
 * window. Inside it, the request is recorded and kept by the release below.
 */
export function requestRefresh(refresh: Refresh): void {
  if (held > 0) {
    owed = true;
    return;
  }

  refresh();
}

/**
 * Take the page for the length of a mutation.
 *
 * The returned function gives it back, and is the mutation's own re-read:
 * `changed` says whether the server actually changed, so a refusal releases the
 * page without re-reading it — while still keeping anything the poller was owed
 * meanwhile, because a refused delete says nothing about the job that finished
 * behind it.
 *
 * Releasing while another mutation still holds the page hands the debt on rather
 * than paying it: the read that matters is the one after the LAST of them.
 */
export function holdPage(): (refresh: Refresh, changed: boolean) => void {
  held += 1;
  let released = false;

  return (refresh, changed) => {
    // A second release from one hold would let the count drift below zero and
    // leave the page permanently unheld — or, released twice by two mutations,
    // unheld while one is still running.
    if (released) return;
    released = true;
    held -= 1;

    if (held > 0) {
      owed = owed || changed;
      return;
    }

    const wanted = owed || changed;
    owed = false;
    if (wanted) refresh();
  };
}

/** The suite's way back to a clean page, since the state above outlives a
 *  render: a case that unmounts mid-mutation leaves a hold nobody will release,
 *  and every case after it would find the poller silently deferring to it. */
export function resetPageRefresh(): void {
  held = 0;
  owed = false;
}

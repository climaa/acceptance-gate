// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeleteReportButton,
  DeleteSetButton,
  PruneButton,
} from '../components/ConfirmDialogs';
import { refreshCalls } from './stubs/next-navigation';

/**
 * D2 as a screen: nothing is deleted implicitly, and every refusal comes back in
 * the words the server refused with.
 *
 * The two dialogs carry the whole of that decision. A delete names the one set it
 * is about to remove; a prune names both halves — what goes and what stays —
 * because "prune the rest" is the only bulk path in this console and the rest is
 * exactly what a reviewer cannot see from the button. What comes back from a
 * refused mutation is prose: `a job is already running`, or the path of the
 * worktree still holding the set. A screen showing `409` instead is a review
 * failure, so these cases assert the sentence.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshCalls.length = 0;
});

const SET = 'main-2026-08-17';

const REPORT = 'main-2026-08-17__main-2026-08-13';

const HELD =
  'main-2026-08-17 is checked out in the worktree at /repo/../wt-a — retire that worktree before deleting the set';

const JOB_RUNNING = 'a job is already running';

const SETS = ['main-2026-08-17', 'main-2026-08-16', 'main-2026-08-15', 'wip-2026-08-14'];

/** The mutating endpoints, answered with whatever the case is about. */
function stubFetch(response: { ok?: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn(
    () =>
      Promise.resolve({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: () => Promise.resolve(response.body ?? {}),
      }) as never,
  );
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

const openDelete = () => fireEvent.click(screen.getByRole('button', { name: 'delete' }));

const openPrune = () =>
  fireEvent.click(screen.getByRole('button', { name: 'prune the rest' }));

const dialog = (name: string) => screen.getByRole('dialog', { name });

describe('the delete confirmation', () => {
  it('does not delete on the button alone', () => {
    const fetchMock = stubFetch({});
    render(<DeleteSetButton label={SET} />);

    openDelete();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names the set it is about to remove', () => {
    stubFetch({});
    render(<DeleteSetButton label={SET} />);

    openDelete();

    expect(within(dialog('Confirm deletion')).getAllByText(SET).length).toBeGreaterThan(
      0,
    );
  });

  it('deletes the one set the dialog named', async () => {
    const fetchMock = stubFetch({ body: { removed: SET } });
    render(<DeleteSetButton label={SET} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${SET}` }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/sets/${SET}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
    // The sets table beside this is server-rendered, so the row only goes once
    // the page is re-read.
    await vi.waitFor(() => expect(refreshCalls).toEqual(['refresh']));
  });

  it('closes without a request when the reviewer backs out', () => {
    const fetchMock = stubFetch({});
    render(<DeleteSetButton label={SET} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Confirm deletion' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The acceptance scenario: "the deletion is refused naming what holds it".
  it('surfaces a held set as the sentence the server refused with', async () => {
    stubFetch({ ok: false, status: 409, body: { error: HELD } });
    render(<DeleteSetButton label={SET} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${SET}` }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(HELD);
  });

  it('keeps the dialog open on a refusal, so the reason sits beside the action', async () => {
    stubFetch({ ok: false, status: 409, body: { error: JOB_RUNNING } });
    render(<DeleteSetButton label={SET} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${SET}` }));

    expect(await screen.findByText(JOB_RUNNING)).toBeDefined();
    expect(dialog('Confirm deletion')).toBeDefined();
  });

  /**
   * The cross-component half of a rule `RunPanel` already keeps inside itself.
   *
   * Both alerts are drawn by ONE condition — a job is running — so a refused
   * delete and the run panel's own announcement are on screen together by the
   * ordinary path rather than a contrived one. `apps/e2e/pages/console.ts` reads
   * every console refusal with `getByRole('main').getByRole('alert')`, which is
   * strict, so a dialog announcing from inside `main` failed each of those
   * scenarios on ambiguity. `Dialog` portals to `document.body` (#319); this is
   * that portal asserted where the pair actually meets.
   */
  it('announces its refusal from outside the landmark it was opened inside', async () => {
    stubFetch({ ok: false, status: 409, body: { error: JOB_RUNNING } });
    render(
      <main>
        <DeleteSetButton label={SET} />
      </main>,
    );
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${SET}` }));

    // Found first, so the empty list below cannot pass by the refusal simply
    // not having arrived yet.
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(within(screen.getByRole('main')).queryAllByRole('alert')).toHaveLength(0);
  });

  // A refusal a JSON body never explained is still a refusal, and the screen has
  // to say something a reviewer can act on rather than nothing at all.
  it('says something a reviewer can read when the API answers no prose', async () => {
    stubFetch({ ok: false, status: 500, body: {} });
    render(<DeleteSetButton label={SET} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${SET}` }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not delete/i);
  });

  /**
   * The encode, pinned by the only input that can show it.
   *
   * `SetLabelSchema` allows `[A-Za-z0-9][A-Za-z0-9.-]*`, and every character in
   * that class is unreserved — so `encodeURIComponent` is a no-op for every
   * legal label, and the assertion above (`/api/sets/main-2026-08-17`) passes
   * whether the encode is there or not. What the encode is FOR is a registry
   * entry whose label is not a label: it has to reach the route as ONE segment,
   * or `sets/../…` names a directory outside `sets/`. That is the case this
   * asserts, and it is the only one that can fail.
   */
  it('sends a label that is not a label as one segment', () => {
    const fetchMock = stubFetch({});
    render(<DeleteSetButton label="../etc" />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: 'delete ../etc' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/sets/..%2Fetc', {
      method: 'DELETE',
      cache: 'no-store',
    });
  });

  /**
   * The report twin, which had no test of its own until this one.
   *
   * Every case above renders `DeleteSetButton`; both now share one
   * implementation, so those seven are true of this one too. What they cannot
   * cover is the four values that ARE the difference, and this is the only
   * automated reader of them — the report delete's own e2e lives in the local
   * lane, which is not run casually.
   */
  it('names the report it is about to remove, and what survives it', () => {
    stubFetch({});
    render(<DeleteReportButton id={REPORT} />);
    openDelete();

    const box = dialog('Confirm deletion');
    const detail = box.querySelector('.vd-confirm__detail')?.textContent;

    expect(box.querySelector('.vd-confirm__question')?.textContent).toBe(
      `Delete the report ${REPORT}?`,
    );
    // Both halves. The twins say opposite things about what survives, so
    // asserting only that one clause is present would pass on a swapped detail
    // — and a report dialog promising "the reports that compared it stay" is
    // not vague, it is false.
    expect(detail).toMatch(/two capture sets it compared stay/i);
    expect(detail).not.toMatch(/reports that compared it stay/i);
  });

  it('deletes the one report the dialog named', () => {
    const fetchMock = stubFetch({ body: { removed: REPORT } });
    render(<DeleteReportButton id={REPORT} />);
    openDelete();

    fireEvent.click(screen.getByRole('button', { name: `delete ${REPORT}` }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/reports/${REPORT}`, {
      method: 'DELETE',
      cache: 'no-store',
    });
  });
});

describe('the prune confirmation', () => {
  /**
   * The confirm button says the word the control it stands behind says.
   *
   * "remove" would name the effect and lose the act: the reviewer opened this
   * from `prune the rest`, and the acceptance scenario reaches into the dialog
   * for the button that finishes what it started. It still carries the count,
   * which is the half `prune the rest` cannot show.
   */
  it('confirms with the word the control it stands behind uses', () => {
    stubFetch({});
    render(<PruneButton keep={3} labels={SETS} />);

    openPrune();

    expect(
      within(dialog('Confirm prune')).getByRole('button', { name: 'prune 1 set' }),
    ).toBeDefined();
  });

  it('names what it will remove and what it will keep', () => {
    stubFetch({});
    render(<PruneButton keep={3} labels={SETS} />);

    openPrune();

    const confirm = within(dialog('Confirm prune'));
    expect(confirm.getByText('main-2026-08-15')).toBeDefined();
    expect(confirm.getByText('wip-2026-08-14')).toBeDefined();
  });

  it('prunes to the count the control was set to', async () => {
    const fetchMock = stubFetch({
      body: { kept: SETS.slice(0, 3), removed: [], refused: [] },
    });
    render(<PruneButton keep={3} labels={SETS} />);
    openPrune();

    fireEvent.click(screen.getByRole('button', { name: 'prune 1 set' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/prune', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ keep: 3 }),
    });
    await vi.waitFor(() => expect(refreshCalls).toEqual(['refresh']));
  });

  // Prune is a bulk action: one held set must not strand the other nine, so the
  // server skips it and says so per set. The dialog stays open on those words.
  it('lists every set the prune skipped, in the server’s words', async () => {
    stubFetch({ body: { kept: SETS.slice(0, 3), removed: [], refused: [HELD] } });
    render(<PruneButton keep={3} labels={SETS} />);
    openPrune();

    fireEvent.click(screen.getByRole('button', { name: 'prune 1 set' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(HELD);
  });

  it('surfaces a prune refused outright as its sentence', async () => {
    stubFetch({ ok: false, status: 409, body: { error: JOB_RUNNING } });
    render(<PruneButton keep={3} labels={SETS} />);
    openPrune();

    fireEvent.click(screen.getByRole('button', { name: 'prune 1 set' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(JOB_RUNNING);
  });

  it('has nothing to confirm when the instance holds fewer sets than it keeps', () => {
    stubFetch({});
    render(<PruneButton keep={5} labels={SETS} />);

    openPrune();

    expect(
      within(dialog('Confirm prune')).getByRole('button', { name: 'prune 0 sets' }),
    ).toHaveProperty('disabled', true);
  });
});

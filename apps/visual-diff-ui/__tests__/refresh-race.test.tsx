// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeleteReportButton } from '../components/ConfirmDialogs';
import { CurrentJob, CurrentJobProvider } from '../components/CurrentJob';
import type { HistoryRecord } from '../lib/job-contract';
import { resetPageRefresh } from '../lib/page-refresh';
import { refreshCalls } from './stubs/next-navigation';

/**
 * The two re-reads this console used to run independently, in the one window
 * where they overlap.
 *
 * Every table here is server-rendered, so both a mutation and a finished job end
 * in `router.refresh()`. Finishing a compare is exactly when a reviewer tidies
 * up, so a delete lands within a second or two of the poller noticing the job —
 * and the poller's refresh read the tables BEFORE the delete. Whichever resolves
 * last is what stays on screen, and the poller has nothing later to say: it
 * refreshes once per job id and then backs off to `MAX_IDLE_POLL_MS`. The
 * deleted row is not flickering, it is stuck.
 *
 * What is asserted is the invariant rather than the symptom, because the symptom
 * is a resolution order jsdom does not have: while a mutation holds the page,
 * nothing else may re-read it, and the re-read that follows is the mutation's.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refreshCalls.length = 0;
  localStorage.clear();
  // Module state, so it outlives a render: a case that unmounted mid-mutation
  // would otherwise leave the page held for every case after it.
  resetPageRefresh();
});

const REPORT = 'main-2026-08-17__main-2026-08-13';

const RUNNING: HistoryRecord = {
  id: '2026-08-17T08-00-00Z-compare',
  mode: 'compare',
  label: REPORT,
  startedAt: '2026-08-17T08:00:00Z',
  endedAt: null,
  exitCode: null,
  reportId: null,
};

const FINISHED: HistoryRecord = {
  ...RUNNING,
  endedAt: '2026-08-17T08:01:35Z',
  exitCode: 1,
  reportId: REPORT,
};

/**
 * The console's two endpoints, with the DELETE held open by the case.
 *
 * `finished` flips what `GET /api/jobs/current` answers, so the job ends
 * underneath a delete that has not come back yet — the ordering the race needs
 * and the one a reviewer produces by tidying up after a compare.
 */
function stubConsole() {
  const state = { finished: false };
  let land = () => {};
  const landed = new Promise<void>((resolve) => {
    land = resolve;
  });

  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/jobs/current') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            isSample: false,
            running: !state.finished,
            job: state.finished ? FINISHED : RUNNING,
            reportExists: true,
            log: state.finished ? ['exit 1'] : ['comparing'],
          }),
      }) as never;
    }

    return landed.then(
      () =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ removed: REPORT }),
        }) as never,
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  return { state, land: () => land() };
}

const renderConsole = () =>
  render(
    <CurrentJobProvider>
      <CurrentJob />
      <DeleteReportButton id={REPORT} />
    </CurrentJobProvider>,
  );

describe('a delete that lands while the poller is noticing a job', () => {
  it('leaves the page to the mutation, and re-reads it once, afterwards', async () => {
    const { state, land } = stubConsole();
    renderConsole();

    // The first poll primes the poller: the job it is mounted beside is running,
    // so there is nothing to report yet.
    await screen.findByText('comparing');

    // The reviewer deletes the report. The DELETE is held open below.
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    fireEvent.click(screen.getByRole('button', { name: `delete ${REPORT}` }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'cancel' })).toBeTruthy(),
    );

    // ...and the job ends underneath it, which is what the poller re-reads for.
    state.finished = true;
    await screen.findByRole('button', { name: 'dismiss this run' }, { timeout: 5000 });

    // The server still has the report on disk — the DELETE has not returned —
    // so a re-read issued here paints the row this reviewer just removed.
    expect(refreshCalls).toEqual([]);

    land();

    // One re-read, and it is the one that read the server after the delete.
    await waitFor(() => expect(refreshCalls).toEqual(['refresh']));
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentJob, CurrentJobProvider, useCurrentJob } from '../components/CurrentJob';
import type { HistoryRecord } from '../lib/jobs';
import { refreshCalls } from './stubs/next-navigation';

/**
 * The current-job region: what is running, what it has said, and where the run
 * that just ended left its report.
 *
 * Driven through the provider rather than through a presentational prop, because
 * the poll IS the component's contract — `GET /api/jobs/current` answered with
 * the last run when nothing is running is what keeps a finished job's log on
 * screen (its last line, `exit <code>`, is the streaming assertion surface), and
 * a test that rendered a hand-made state would assert none of it.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Restored here, never at the end of a test body: a case that fails before
  // its last line would otherwise leave fake timers installed and every test
  // after it would time out on a clock nobody is advancing.
  vi.useRealTimers();
  refreshCalls.length = 0;
  // The visibility getter is redefined on `document` itself, which outlives a
  // render — a test that left it hidden would silence every poll after it.
  setVisibility('visible');
});

const RUNNING: HistoryRecord = {
  id: '2026-08-17T08-00-00Z-compare',
  mode: 'compare',
  label: 'main-2026-08-17__main-2026-08-13',
  startedAt: '2026-08-17T08:00:00Z',
  endedAt: null,
  exitCode: null,
  reportId: null,
};

const FINISHED: HistoryRecord = {
  ...RUNNING,
  endedAt: '2026-08-17T08:01:35Z',
  exitCode: 1,
  reportId: 'main-2026-08-17__main-2026-08-13',
};

interface CurrentPayload {
  isSample?: boolean;
  running: boolean;
  job: HistoryRecord | null;
  log?: string[];
}

/** `GET /api/jobs/current`, answered with whatever the case is about. Returns
 *  the mock so a case can assert how it was called. */
function stubCurrent(payload: CurrentPayload) {
  const json = { isSample: false, log: [], ...payload };
  const fetchMock = vi.fn(
    () => Promise.resolve({ ok: true, json: () => Promise.resolve(json) }) as never,
  );
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

/** jsdom reports `visible` and never changes it, so both halves of the
 *  visibility contract have to be driven by hand. */
function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => value,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

const hide = () => setVisibility('hidden');
const show = () => setVisibility('visible');

const renderCurrentJob = () =>
  render(
    <CurrentJobProvider>
      <CurrentJob />
    </CurrentJobProvider>,
  );

const region = () => screen.getByRole('region', { name: 'Current job' });

describe('the current-job region', () => {
  it('announces itself politely, so a run that ends is heard without being watched', () => {
    stubCurrent({ running: false, job: null });

    renderCurrentJob();

    expect(region().getAttribute('aria-live')).toBe('polite');
  });

  // Pinned copy: the empty state names the panel above it, which is where a
  // reviewer with nothing running has to go next.
  it('says exactly what to do when nothing has ever run', async () => {
    stubCurrent({ running: false, job: null });

    renderCurrentJob();

    expect(await screen.findByText('Nothing running. Start a job above.')).toBeDefined();
  });

  it('polls the current-job endpoint without a cache', async () => {
    const fetchMock = stubCurrent({ running: false, job: null });

    renderCurrentJob();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]).toEqual(['/api/jobs/current', { cache: 'no-store' }]);
  });

  /**
   * A sample instance serves a committed fixture with no CLI behind it, so
   * `running` is false forever and the history cannot grow. Every poll after
   * the first asks a question whose answer cannot change — and left ticking on
   * the deployed console, one open tab is 86,400 requests a day for it.
   */
  it('stops polling once it learns the instance can never run a job', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: true, running: false, job: null });

    renderCurrentJob();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps polling an instance that has a runner behind it', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: false, job: null });

    renderCurrentJob();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  // A hidden tab is not watching a log: the panel it feeds is not painted, and
  // the answer is re-read on the way back. A console left open in a background
  // window should cost nothing until someone looks at it.
  it('pauses while the tab is hidden and resumes when it comes back', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: false, job: null });
    renderCurrentJob();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    hide();
    const whileHidden = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(whileHidden);

    show();
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(whileHidden),
    );
  });

  it('names the running job by mode and label', async () => {
    stubCurrent({ running: true, job: RUNNING });

    renderCurrentJob();

    expect(await within(region()).findByText(RUNNING.label)).toBeDefined();
    expect(within(region()).getByText('compare')).toBeDefined();
  });

  // The end of a run is the moment its log matters most, so the panel keeps
  // showing the last one rather than emptying itself the moment the lock goes.
  it('links a finished run into the report it produced', async () => {
    stubCurrent({ running: false, job: FINISHED });

    renderCurrentJob();

    const view = await screen.findByRole('link', { name: 'view report' });

    expect(view.getAttribute('href')).toBe(`/report/${FINISHED.reportId}`);
  });

  it('offers no report link for a run that produced none', async () => {
    stubCurrent({ running: false, job: { ...FINISHED, reportId: null } });

    renderCurrentJob();

    await screen.findByText(/exit/);
    expect(screen.queryByRole('link', { name: 'view report' })).toBeNull();
  });

  // A console whose job API is unreachable is still a console: the tables beside
  // this region are server-rendered and stay true.
  it('survives a poll that fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline')) as never),
    );

    renderCurrentJob();

    expect(await screen.findByText('Nothing running. Start a job above.')).toBeDefined();
  });
});

describe('the live log', () => {
  const LOG = ['comparing 6 shot(s) against 6 baseline(s)', 'wrote report', 'exit 1'];

  it('is a tail nothing announces — a stdout stream must not be read aloud', async () => {
    stubCurrent({ running: true, job: RUNNING, log: LOG });

    renderCurrentJob();

    const log = await screen.findByTestId('log-tail');

    expect(log.getAttribute('aria-live')).toBe('off');
  });

  // The terminal line is the streaming contract: a job is over when its log says
  // what it exited with, and nothing else in the panel promises that.
  it('ends a finished job with its exit line', async () => {
    stubCurrent({ running: false, job: FINISHED, log: LOG });

    renderCurrentJob();

    const log = await screen.findByTestId('log-tail');

    expect(log.textContent?.trimEnd().endsWith('exit 1')).toBe(true);
  });

  it('shows no log frame before a job has said anything', async () => {
    stubCurrent({ running: true, job: RUNNING, log: [] });

    renderCurrentJob();

    await screen.findByText(RUNNING.label);
    expect(screen.queryByTestId('log-tail')).toBeNull();
  });
});

describe('the console around it', () => {
  // The tables beside this region are server-rendered: the history row, the new
  // report and the set the run wrote are all stale the moment the job ends, and
  // the poll is the only thing that knows it did.
  it('re-reads the server when a running job finishes', async () => {
    const responses = [
      { isSample: false, running: true, job: RUNNING, log: [] },
      { isSample: false, running: false, job: FINISHED, log: ['exit 1'] },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(responses.shift() ?? responses[0]),
          }) as never,
      ),
    );

    renderCurrentJob();

    await waitFor(() => expect(refreshCalls).toEqual(['refresh']), { timeout: 5000 });
  });

  it('does not re-read the server for a job that was already over', async () => {
    stubCurrent({ running: false, job: FINISHED });

    renderCurrentJob();

    await screen.findByRole('link', { name: 'view report' });
    expect(refreshCalls).toEqual([]);
  });

  // A capture the host guard refuses exits in a few hundred milliseconds — well
  // inside one poll — so the running state is never observed. Keying on the
  // transition left the history table rendering the row as it looked mid-flight:
  // `interrupted`, no exit code, no duration, beside a region reading `failed
  // exit 2` about the same run.
  it('re-reads the server for a job that began and ended between two polls', async () => {
    const responses = [
      { isSample: false, running: false, job: null, log: [] },
      { isSample: false, running: false, job: FINISHED, log: ['exit 2'] },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(responses.shift() ?? responses[0]),
          }) as never,
      ),
    );

    renderCurrentJob();

    await waitFor(() => expect(refreshCalls).toEqual(['refresh']), { timeout: 5000 });
  });

  // One row, one re-read. The poll keeps seeing the same finished job for as
  // long as the console is open, and a refresh per tick would re-render every
  // table beside it once a second.
  it('re-reads once for a job, not once per poll', async () => {
    const responses = [
      { isSample: false, running: true, job: RUNNING, log: [] },
      { isSample: false, running: false, job: FINISHED, log: ['exit 1'] },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          Promise.resolve({
            ok: true,
            json: () => Promise.resolve(responses.shift() ?? responses.at(-1)),
          }) as never,
      ),
    );

    renderCurrentJob();

    await waitFor(() => expect(refreshCalls).toEqual(['refresh']), { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(refreshCalls).toEqual(['refresh']);
  });
});

describe('the elapsed counter', () => {
  // The clock is frozen rather than the timers: Testing Library's own waiting is
  // built on timers, and faking those would stall every `findBy` in this block.
  // What the counter reads is `Date.now()`, and that is what a case has to own.
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-17T08:03:12Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // D1's panel line: mode · label · elapsed. A capture runs for minutes, and how
  // long it has been going is the only progress the console can promise.
  it('counts from the moment the running job started', async () => {
    stubCurrent({ running: true, job: RUNNING });

    renderCurrentJob();

    expect(await within(region()).findByText('3m 12s')).toBeDefined();
  });

  // The panel's section is `aria-live="polite"` and this text changes once a
  // second — `formatDuration` floors to seconds, so every tick is a new string.
  // Without the opt-out a screen reader re-reads the whole region on each one:
  // "running capture main 42s", "…43s", "…44s", for the length of a capture. Both
  // halves are asserted here, because the case is only meaningful while the
  // region stays polite.
  it('does not announce the tick, so the region is not re-read every second', async () => {
    stubCurrent({ running: true, job: RUNNING });

    renderCurrentJob();

    const figure = await within(region()).findByText('3m 12s');

    expect(figure.getAttribute('aria-live')).toBe('off');
    expect(region().getAttribute('aria-live')).toBe('polite');
  });

  // The same rule the poller keeps, for the same reason: a hidden tab is not
  // reading a clock. The tick is re-run on the way back rather than merely
  // resumed, so the number is right on the first painted frame.
  it('stops ticking while the tab is hidden and is right again on return', async () => {
    stubCurrent({ running: true, job: RUNNING });

    renderCurrentJob();
    expect(await within(region()).findByText('3m 12s')).toBeDefined();

    hide();
    // A minute passes with nobody looking. This block runs on REAL timers (see
    // the note above — Testing Library's waiting is built on them), so the wait
    // has to be real too: anything shorter than the one-second tick would pass
    // whether or not the interval is still running, which is a test that cannot
    // fail. It is the one slow assertion in this file, and it is what makes the
    // hidden-tab guard observable at all.
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-08-17T08:04:12Z'));
    await new Promise((resume) => setTimeout(resume, 1_200));
    expect(within(region()).getByText('3m 12s')).toBeDefined();

    show();
    expect(await within(region()).findByText('4m 12s')).toBeDefined();
  });

  it('reports what a finished run took, not what has passed since', async () => {
    stubCurrent({ running: false, job: FINISHED });

    renderCurrentJob();

    expect(await within(region()).findByText('1m 35s')).toBeDefined();
  });
});

/**
 * What an idle console costs, which used to be one request a second forever.
 *
 * The poller stops for a hidden tab and freezes on a sample instance, and both
 * are covered above — but a real console on a developer's machine is neither,
 * so it polled indefinitely whether or not anything was running. Measured
 * before this changed: 35 requests in 32 seconds with nothing in flight.
 */
describe('the poll cadence', () => {
  // 1s, 2s, 4s, 8s, 8s… — four requests in the first ten seconds where the old
  // fixed interval made eleven.
  it('backs off while the console is idle', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: false, job: null });

    renderCurrentJob();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock.mock.calls.length).toBeLessThan(6);
  });

  // The backoff must never reach the one case the panel exists for: a running
  // job's log is being read as it is written, so it keeps the full cadence
  // whether or not this particular second added a line.
  it('keeps the full cadence while a job is running', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: true, job: RUNNING });

    renderCurrentJob();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  // Coming back to the tab is new information — the answer may have moved while
  // nobody was asking — so the wait starts over rather than resuming wherever
  // the backoff had got to.
  it('resets the backoff when the tab comes back', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: false, job: null });

    renderCurrentJob();
    // Timers are advanced explicitly rather than through `vi.waitFor`, which
    // advances them itself — the count is the assertion here, so nothing else
    // may move the clock.
    await vi.advanceTimersByTimeAsync(10_000);

    hide();
    await vi.advanceTimersByTimeAsync(5_000);
    const backedOff = fetchMock.mock.calls.length;

    show();
    // Immediately, not on the eight-second timer the backoff had reached.
    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock.mock.calls.length).toBe(backedOff + 1);
  });
});

/**
 * The provider's value, and why its identity matters.
 *
 * Every poll used to hand the context a freshly built object whether or not it
 * said anything new, so React could not bail out. `RunPanel` reads this context
 * twice, which made its whole 800-line subtree re-render once a second for as
 * long as a console was open — and that subtree read `localStorage` during
 * render, so the cost was a synchronous storage parse per second, forever.
 */
describe('the provider value', () => {
  function CountingConsumer({ onRender }: { onRender: () => void }) {
    useCurrentJob();
    onRender();

    return null;
  }

  it('does not re-render its consumers while the answer is unchanged', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: true, job: RUNNING });
    const onRender = vi.fn();

    render(
      <CurrentJobProvider>
        <CountingConsumer onRender={onRender} />
      </CurrentJobProvider>,
    );

    // Long enough for the first answer to arrive AND to be rendered — that one
    // genuinely changes the state, from `IDLE` to a running job, and is not the
    // re-render this is about.
    await vi.advanceTimersByTimeAsync(1_500);
    const settled = onRender.mock.calls.length;
    const polled = fetchMock.mock.calls.length;

    // Ten more polls at the running cadence, every one of them the same answer.
    await vi.advanceTimersByTimeAsync(10_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(polled + 9);
    expect(onRender).toHaveBeenCalledTimes(settled);
  });

  it('does re-render them when the log grows', async () => {
    vi.useFakeTimers();
    const onRender = vi.fn();
    let log = ['comparing 6 shot(s)'];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ isSample: false, running: true, job: RUNNING, log }),
          }) as never,
      ),
    );

    render(
      <CurrentJobProvider>
        <CountingConsumer onRender={onRender} />
      </CurrentJobProvider>,
    );

    await vi.waitFor(() => expect(onRender).toHaveBeenCalled());
    const settled = onRender.mock.calls.length;

    log = [...log, 'wrote report'];
    await vi.advanceTimersByTimeAsync(2_000);

    expect(onRender.mock.calls.length).toBeGreaterThan(settled);
  });
});

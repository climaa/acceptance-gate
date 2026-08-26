// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CurrentJob,
  CurrentJobProvider,
  useCurrentJob,
  usePollNow,
} from '../components/CurrentJob';
import { DISMISS_STORAGE_KEY } from '../lib/dismiss-state';
import type { HistoryRecord } from '../lib/job-contract';
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
  // The dismissed job id outlives a render the same way, and every case below
  // that does not dismiss anything expects to start with nothing put away.
  localStorage.clear();
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
  /** Whether the report the job names is still on disk. Defaults to "yes, if it
   *  named one at all" — the answer the route gives for a report nobody has
   *  deleted, which is what every case but one here is about. */
  reportExists?: boolean;
  log?: string[];
}

/**
 * One poll's body, completed the way the route completes it.
 *
 * EVERY field, never only the ones a case is about: `readCurrent` parses this
 * answer against `CurrentJobResponseSchema` (lib/api-contract.ts) and discards a
 * body that is not the whole shape, so a stub missing a field would be a poll
 * that never landed rather than the answer the case meant to arrange.
 */
const poll = (payload: CurrentPayload) => ({
  isSample: false,
  log: [],
  reportExists: payload.job?.reportId !== null && payload.job?.reportId !== undefined,
  ...payload,
});

/** `GET /api/jobs/current`, answered with whatever the case is about. Returns
 *  the mock so a case can assert how it was called. */
function stubCurrent(payload: CurrentPayload) {
  const json = poll(payload);
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

  /**
   * The report deleted out from under the panel still showing its run.
   *
   * `job.reportId` says what the run produced, which is not the same claim as
   * "that report is still there" — the row keeps the id after the reports panel
   * beside it deletes the tree. Only the server can tell the difference, so it
   * sends `reportExists` and this region believes it over the id.
   */
  it('withdraws the report link once the report is deleted', async () => {
    stubCurrent({ running: false, job: FINISHED, reportExists: false });

    renderCurrentJob();

    await screen.findByText(/exit/);
    expect(screen.queryByRole('link', { name: 'view report' })).toBeNull();
    // The run is still reported — only the way into what is gone is withdrawn.
    expect(within(region()).getByText(FINISHED.label)).toBeDefined();
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
      poll({ running: true, job: RUNNING }),
      poll({ running: false, job: FINISHED, log: ['exit 1'] }),
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
      poll({ running: false, job: null }),
      poll({ running: false, job: FINISHED, log: ['exit 2'] }),
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
      poll({ running: true, job: RUNNING }),
      poll({ running: false, job: FINISHED, log: ['exit 1'] }),
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

/**
 * A poll whose answer is not the shape the route promises.
 *
 * The endpoint and this poller agree today because one commit wrote both, and
 * `CurrentJobResponseSchema` is now the only thing standing between a changed
 * payload and a region reading it as something else. A discarded answer is the
 * state `readCurrent` already has for a poll that never landed: the last good
 * answer stays on screen, nothing is announced, and the next tick tries again.
 *
 * The alternative — reading the fields that happen to be well formed — is what
 * this replaces, and it paints a state no run was ever in: a finished job with
 * no exit code, or a running one whose log has vanished.
 */
describe('a poll it cannot parse', () => {
  /** A running job, then an answer that has lost its `job`. */
  function stubDrift() {
    const answers = [poll({ running: true, job: RUNNING, log: ['comparing'] })];
    const fetchMock = vi.fn(
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(answers.shift() ?? { running: true, log: [] }),
        }) as never,
    );
    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
  }

  it('keeps drawing the last answer it could read', async () => {
    vi.useFakeTimers();
    stubDrift();
    renderCurrentJob();
    await vi.waitFor(() =>
      expect(within(region()).getByText(RUNNING.label)).toBeDefined(),
    );

    await vi.advanceTimersByTimeAsync(3_000);

    expect(within(region()).getByText(RUNNING.label)).toBeDefined();
    expect(screen.getByTestId('log-tail').textContent).toContain('comparing');
  });

  // Not an error state, and not a reason to re-read the page: everything else on
  // this console is server-rendered and still true.
  it('says nothing to the tables around it', async () => {
    vi.useFakeTimers();
    stubDrift();
    renderCurrentJob();
    await vi.waitFor(() =>
      expect(within(region()).getByText(RUNNING.label)).toBeDefined(),
    );

    await vi.advanceTimersByTimeAsync(3_000);

    expect(refreshCalls).toEqual([]);
  });

  it('goes on polling, because the next answer may be readable', async () => {
    vi.useFakeTimers();
    const fetchMock = stubDrift();
    renderCurrentJob();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const settled = fetchMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(3_000);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(settled);
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
            json: () => Promise.resolve(poll({ running: true, job: RUNNING, log })),
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

/**
 * The poke, and the chain it must not fork.
 *
 * `usePollNow` re-arms by calling `stop()` then `sync()` back to back. An
 * in-flight poll disowned by that `stop` finds `armed` true again by the time it
 * resumes — `sync` set it, for the NEW chain — so without a generation token it
 * carries on and schedules a timer beside the new one. Nothing holds the older
 * handle, so nothing can clear it, and the console settles into polling at twice
 * the rate: measured at 16 requests where one chain makes 9.
 *
 * Which is the exact failure this file exists to prevent, arriving by the door
 * that was opened to fix it.
 */
describe('an out-of-band poll request', () => {
  /** Calls `usePollNow` once, `at` milliseconds in — long enough to land while
   *  the first poll is still waiting on the slow endpoint below. */
  function Poker({ at }: { at: number }) {
    const pollNow = usePollNow();

    useEffect(() => {
      const timer = setTimeout(() => pollNow(), at);

      return () => clearTimeout(timer);
    }, [pollNow, at]);

    return null;
  }

  /**
   * What the poke is FOR, as opposed to what it must not break.
   *
   * The backoff is the whole reason it exists: a console that has been idle for
   * a few seconds is up to `MAX_IDLE_POLL_MS` away from its next question, and
   * the moment a job starts is the moment that wait is most wrong. Asserted by
   * advancing to a known point in the backoff and then poking — the answer has
   * to arrive on the poke rather than on the timer that was already pending.
   *
   * Deliberately NOT an e2e scenario. The browser cannot be told where in the
   * backoff it is, so a scenario would have to idle for real seconds and then
   * assert against a window it could only guess at — flaky by construction, and
   * `suite-integrity.mjs` pins the scenario count, so a flaky one is a recurring
   * red. Fake timers can be exact about it; a browser cannot.
   */
  it('collapses a backed-off wait when asked to poll now', async () => {
    vi.useFakeTimers();
    const fetchMock = stubCurrent({ isSample: false, running: false, job: null });
    let pollNow: () => void = () => {};

    function Handle() {
      pollNow = usePollNow();

      return null;
    }

    render(
      <CurrentJobProvider>
        <Handle />
      </CurrentJobProvider>,
    );

    // Far enough in for the idle backoff to have reached its ceiling, so the
    // next scheduled poll is seconds away rather than one tick.
    await vi.advanceTimersByTimeAsync(30_000);
    const backedOff = fetchMock.mock.calls.length;

    // A hundred milliseconds is nowhere near `MAX_IDLE_POLL_MS`, so a request
    // inside it can only have come from the poke.
    act(() => pollNow());
    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock.mock.calls.length).toBe(backedOff + 1);
  });

  it('does not leave two poll chains running', async () => {
    vi.useFakeTimers();
    let calls = 0;
    // 400ms per answer, so the poke at 200ms is guaranteed to land mid-flight.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1;

        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: () =>
                  Promise.resolve({
                    isSample: false,
                    running: true,
                    job: RUNNING,
                    log: [],
                  }),
              }),
            400,
          ),
        ) as never;
      }),
    );

    render(
      <CurrentJobProvider>
        <Poker at={200} />
      </CurrentJobProvider>,
    );

    await vi.advanceTimersByTimeAsync(10_000);

    // One chain at 400ms of work plus a 1s wait is 7-9 requests in ten seconds.
    // Two chains were measured at 16.
    expect(calls).toBeLessThan(12);
  });
});

/**
 * Putting the last run away.
 *
 * `GET /api/jobs/current` answers with the last finished run when nothing is
 * running, deliberately — so on any instance that has ever run anything, the
 * panel's empty state is otherwise unreachable. These cases are the way back to
 * it, and the guard rails around it: a dismissal hides one job id in one
 * browser, and never touches the run.
 */
describe('dismissing the run on the card', () => {
  const dismissButton = () => screen.queryByRole('button', { name: 'dismiss this run' });

  it('replaces a finished run with the empty state', async () => {
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);

    fireEvent.click(dismissButton() as HTMLElement);

    expect(screen.getByText('Nothing running. Start a job above.')).toBeDefined();
    expect(screen.queryByText(FINISHED.label)).toBeNull();
  });

  // The panel this console polls once a second must never be silent about work
  // in flight, so there is nothing to press while a job is running.
  it('offers nothing to press while a job is running', async () => {
    stubCurrent({ running: true, job: RUNNING });
    renderCurrentJob();
    await screen.findByText(RUNNING.label);

    expect(dismissButton()).toBeNull();
  });

  // Absent rather than disabled, the same answer the label wand gives: there is
  // no run on the card to put away.
  it('offers nothing to press once the run is already put away', async () => {
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);

    fireEvent.click(dismissButton() as HTMLElement);

    expect(dismissButton()).toBeNull();
  });

  // The dismissal is keyed on the job id and nothing else, which is what makes
  // it self-clearing: the next run is a different id and arrives unasked.
  it('shows the next run without being asked again', async () => {
    const next: HistoryRecord = {
      ...FINISHED,
      id: '2026-08-17T09-00-00Z-capture',
      label: 'main-2026-08-17',
    };
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);
    fireEvent.click(dismissButton() as HTMLElement);

    stubCurrent({ running: false, job: next });

    expect(await screen.findByText(next.label)).toBeDefined();
    expect(dismissButton()).not.toBeNull();
  });

  /**
   * The probe is what makes the reload case mean anything: the panel is empty
   * before the first poll lands too, so without waiting for the answer to
   * arrive the assertion would pass on a build that never dismissed anything.
   */
  function JobProbe() {
    const { job } = useCurrentJob();

    return <span data-testid="polled">{job?.id ?? 'none'}</span>;
  }

  it('is still put away after a reload', async () => {
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);
    fireEvent.click(dismissButton() as HTMLElement);
    cleanup();

    render(
      <CurrentJobProvider>
        <CurrentJob />
        <JobProbe />
      </CurrentJobProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('polled').textContent).toBe(FINISHED.id),
    );
    expect(within(region()).queryByText(FINISHED.label)).toBeNull();
    expect(
      within(region()).getByText('Nothing running. Start a job above.'),
    ).toBeDefined();
  });

  /**
   * Private mode, and site data blocked. The snapshot moves before the write, so
   * the reader still gets what they asked for — losing it on the next load is
   * the documented failure; a button that does nothing is not.
   */
  it('puts the run away even when storage refuses the write', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is full');
    });
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);

    fireEvent.click(dismissButton() as HTMLElement);

    expect(screen.getByText('Nothing running. Start a job above.')).toBeDefined();
    setItem.mockRestore();
  });

  /**
   * Two console tabs both poll this panel. `storage` fires in every OTHER
   * document on the origin, so without it one tab goes on showing a run the
   * other put away.
   */
  it('follows a dismissal made in another tab', async () => {
    stubCurrent({ running: false, job: FINISHED });
    renderCurrentJob();
    await screen.findByText(FINISHED.label);

    localStorage.setItem(DISMISS_STORAGE_KEY, FINISHED.id);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: DISMISS_STORAGE_KEY }));
    });

    expect(screen.getByText('Nothing running. Start a job above.')).toBeDefined();
  });
});

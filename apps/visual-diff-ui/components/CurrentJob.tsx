'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EmptyState, Link, Stack } from '@gate/ui';
import type { HistoryRecord } from '@/lib/jobs';
import { durationOf, formatDuration, jobState } from '@/lib/outcome';
import { LogTail } from './LogTail';

/**
 * What is running right now, what it has said, and where the last run left its
 * report.
 *
 * One poller for the whole console: the run panel needs the same answer this
 * region draws — D1 replaces its start button with a link to here while a job
 * holds the lock — and two components polling the same endpoint would be two
 * consoles disagreeing about whether anything is running. The provider owns the
 * interval; both surfaces read the context.
 *
 * `GET /api/jobs/current` answers with the LAST run when nothing is running, so
 * this region does not empty itself the moment a job ends: the end of a run is
 * when its log matters most, and its final `exit <code>` line is the only thing
 * that promises the run is over.
 */

/** The anchor D1's link jumps to — the run panel names it, so the two live in
 *  the module that owns the region rather than in the one that points at it. */
export const CURRENT_JOB_ANCHOR = 'vd-current-job';

/** The region's accessible name, pinned: the acceptance scenarios find this
 *  panel by it, and the title below is the same string uppercased by CSS. */
const CURRENT_JOB_TITLE = 'Current job';

const NOTHING_RUNNING = 'Nothing running. Start a job above.';

const CURRENT_ENDPOINT = '/api/jobs/current';

/** One second — the same cadence the elapsed counter below ticks at, so the log
 *  and the clock beside it move together rather than a second apart. */
const POLL_MS = 1000;

/**
 * The longest this backs off to, and the reason it backs off at all.
 *
 * A running job earns `POLL_MS` — its log is being read as it is written. An
 * idle console earns nothing: `running: false` and the same finished job is an
 * answer incapable of changing until somebody does something, and asking for it
 * once a second is 86,400 requests a day for one sentence. Each unchanged idle
 * answer doubles the wait; anything that moves resets it (see `poll` below), as
 * does coming back to the tab and starting a job.
 *
 * Not `stop()`, the way sample mode may: an idle console is one CLI invocation
 * in another terminal away from having something to say, and a panel that never
 * asked again would not notice.
 */
const MAX_IDLE_POLL_MS = 8000;

/** The tail is capped server-side, so once a long job passes that cap `length`
 *  stops moving and only the newest line does. Both, therefore — and nothing
 *  more: comparing every line of every poll is the kind of per-second work this
 *  comparison exists to avoid. */
const sameLog = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left[left.length - 1] === right[right.length - 1];

/**
 * Whether two polls said the same thing.
 *
 * `id` stands in for `mode`, `label` and `startedAt` — those are fixed for the
 * life of a job, so an id that matches cannot disagree about them. The three
 * fields that DO move as a job ends are named individually.
 *
 * This is what makes the provider's value stable: without it every poll handed
 * the context a new object, and `RunPanel` — which reads it twice — re-rendered
 * its whole subtree once a second forever, `readReviewed`'s synchronous
 * `localStorage` parse included.
 */
function sameAnswer(left: CurrentJobState, right: CurrentJobState): boolean {
  return (
    left.running === right.running &&
    left.job?.id === right.job?.id &&
    left.job?.endedAt === right.job?.endedAt &&
    left.job?.exitCode === right.job?.exitCode &&
    left.job?.reportId === right.job?.reportId &&
    left.reportExists === right.reportExists &&
    sameLog(left.log, right.log)
  );
}

export interface CurrentJobState {
  running: boolean;
  /** The running job, or the last one to finish. Null on an instance that has
   *  never run anything. */
  job: HistoryRecord | null;
  /** Whether the report `job.reportId` names is still on disk, answered by the
   *  server on every poll. Not derivable here: a history row keeps the id of the
   *  report its run produced even after the report is deleted, so the id alone
   *  would offer a link into a 404 — see the route for why this is its answer to
   *  give. False whenever there is no report to begin with, and false whenever
   *  the answer did not carry the field at all: an absent flag withholds a link
   *  that would have worked, which is the cheaper of the two ways to be wrong. */
  reportExists: boolean;
  /** The tail of that job's log, oldest line first. */
  log: readonly string[];
}

const IDLE: CurrentJobState = {
  running: false,
  job: null,
  reportExists: false,
  log: [],
};

const CurrentJobContext = createContext<CurrentJobState>(IDLE);

/** What the console's client islands know about the runner. */
export const useCurrentJob = (): CurrentJobState => useContext(CurrentJobContext);

/**
 * Ask for a poll right now, resetting the idle backoff.
 *
 * A second context rather than a field on `CurrentJobState`, so the state stays
 * a plain data value that `sameAnswer` can compare — a function on it would be
 * a new identity every render and would undo the very thing this file just
 * fixed. The value below is stable for the provider's whole life, so consuming
 * this costs no re-renders at all.
 *
 * The caller that needs it is the run panel: it has just started a job, and
 * without this the panel would sit on a backed-off timer for up to
 * `MAX_IDLE_POLL_MS` before admitting the job exists.
 */
const PollNowContext = createContext<() => void>(() => {});

export const usePollNow = (): (() => void) => useContext(PollNowContext);

/**
 * One poll, or null when the console could not get an answer.
 *
 * A failed poll is deliberately not an error state on screen: everything else on
 * this page is server-rendered and still true, and a fetch that failed once is
 * tried again on the next tick. `no-store` because every field is about right
 * now — a cached answer is a finished job reported as running.
 */
async function readCurrent(): Promise<{
  state: CurrentJobState;
  /** Whether this instance is serving the committed fixture. Carried out of the
   *  response rather than dropped, because it is the answer to "can this console
   *  ever have anything to poll for?" — see the provider. */
  isSample: boolean;
} | null> {
  try {
    const response = await fetch(CURRENT_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<CurrentJobState> & {
      isSample?: boolean;
    };

    return {
      state: {
        running: body.running === true,
        job: body.job ?? null,
        reportExists: body.reportExists === true,
        log: Array.isArray(body.log) ? body.log : [],
      },
      isSample: body.isSample === true,
    };
  } catch {
    return null;
  }
}

/**
 * The poll chain, and everything that only exists to serve it.
 *
 * Split out of `CurrentJobProvider` because that had become a 179-line function
 * whose body was one 132-line effect — the provider's actual job is two lines of
 * JSX, and every ref above it belongs to the poller rather than to the provider.
 * Nothing is threaded in: the state that moved is state the poller owns.
 */
function useJobPoller(): { state: CurrentJobState; pollNow: () => void } {
  const [state, setState] = useState<CurrentJobState>(IDLE);
  const router = useRouter();
  /**
   * The last job this poller told the tables around it about.
   *
   * Keyed on the job's id rather than on a running→idle transition, because a
   * job can begin and end inside one poll interval and never be seen running at
   * all — a capture the host guard refuses exits in a few hundred milliseconds,
   * and the transition it never made left the history table showing the row as
   * it looked mid-flight: `interrupted`, with no exit code and no duration,
   * beside a CURRENT JOB region that said `failed exit 2`.
   *
   * An id that has finished and has not been reported yet is the whole
   * condition, so it also catches a job this tab did not start.
   */
  const reported = useRef<string | null>(null);
  // The first poll establishes that baseline rather than acting on it: the job
  // it finds finished is the one the page it is mounted inside was just
  // rendered with, and re-reading the server for it would refresh every load.
  const primed = useRef(false);
  // The router held through a ref rather than named as a dependency below: the
  // poll chain must be established once, and an effect that lists the router
  // restarts it on every state change the poll itself caused.
  const latestRouter = useRef(router);
  // What the last poll was answered with, mirrored so the next one can tell
  // whether anything moved without reading `state` through the effect's
  // closure — which was captured on mount and is `IDLE` forever.
  const latestState = useRef<CurrentJobState>(IDLE);
  // Filled in by the effect below; empty before mount and after unmount, so a
  // poke that arrives outside the chain's life does nothing rather than throws.
  const poke = useRef<() => void>(() => {});
  // Stable for the poller's whole life, which is what lets `PollNowContext`
  // cost its consumers nothing.
  const pollNow = useCallback(() => poke.current(), []);

  useEffect(() => {
    latestRouter.current = router;
  }, [router]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Whether a poll chain is currently in flight or waiting. `timer` alone
    // cannot answer that: between the await and the next `schedule` there is no
    // timer, and a `visibilitychange` landing in that window would start a
    // second chain running alongside the first.
    let armed = false;
    /**
     * Which chain is the live one. Bumped by every `stop()`, and captured by
     * each poll before it awaits.
     *
     * `armed` alone is not enough, and the gap it leaves is not theoretical: a
     * poke is `stop()` then `sync()` back to back, so an in-flight poll that
     * was disowned by the `stop` finds `armed` true again by the time it
     * resumes — because the `sync` re-armed for the NEW chain. It then
     * schedules a timer of its own beside the new one, nothing ever clears the
     * older handle, and the console polls at twice the rate. Measured at 16
     * requests where one chain makes 8. Pinned by `__tests__/current-job.test.tsx`.
     */
    let generation = 0;
    // How long the next wait is. Reset to `POLL_MS` by anything that moves;
    // doubled by an idle answer that said what the last one did.
    let delay = POLL_MS;
    // Set once the console has learned no job can ever start here. A sample
    // instance is serving a committed fixture with no CLI behind it, so
    // `running` is false forever and the history cannot grow — every poll after
    // the first asks a question whose answer is incapable of changing. Left
    // ticking on a deployment that is one open tab away from 86,400 requests a
    // day, all of them for the same answer.
    let frozen = false;

    const stop = () => {
      armed = false;
      // Disowns any poll already in flight, which `armed` cannot do on its own
      // once a `sync()` re-arms behind it.
      generation += 1;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = (next: number) => {
      if (!armed) return;
      delay = next;
      timer = setTimeout(() => void poll(), next);
    };

    const poll = async () => {
      const mine = generation;
      const answer = await readCurrent();
      // Three ways this poll may no longer be the one that matters: the effect
      // is torn down, the chain is stopped, or the chain moved on without it.
      // The last is the one a poke creates, and the only one that would
      // otherwise end in two timers running side by side.
      if (!live || !armed || mine !== generation) return;

      // A failed poll is not evidence of an idle console, so it does not earn
      // the backoff — it retries at the base cadence, as it always has.
      if (!answer) {
        schedule(POLL_MS);
        return;
      }

      // Compared against a ref rather than against `state`, so this stays out
      // of the setState updater: React may run an updater twice, and deciding
      // the next poll's delay inside one would be a side effect in a place that
      // must be pure.
      const changed = !sameAnswer(latestState.current, answer.state);
      if (changed) {
        latestState.current = answer.state;
        setState(answer.state);
      }

      // A finished job the tables have not been told about: it wrote a history
      // row, and maybe a report and a set. `running` is checked as well as the
      // id, so a job still in flight is not reported as done the first time it
      // is seen.
      const { job, running } = answer.state;
      if (job && !running && reported.current !== job.id) {
        if (primed.current) latestRouter.current.refresh();
        reported.current = job.id;
      }
      primed.current = true;

      if (answer.isSample) {
        frozen = true;
        stop();
        return;
      }

      // A live job's log is being read as it is written, so it keeps the full
      // cadence whether or not this particular second added a line.
      schedule(running || changed ? POLL_MS : Math.min(delay * 2, MAX_IDLE_POLL_MS));
    };

    /* Whether the poll chain should be running right now, and the one place
       that decides. A hidden tab is not watching a log — the panel it feeds is
       not painted, and the answer is re-read on the way back — so a console
       left open in a background window costs nothing until someone looks at it.
       Coming back also resets the backoff: the answer may have changed while
       nobody was asking. */
    const sync = () => {
      if (frozen || document.visibilityState !== 'visible') {
        stop();
        return;
      }

      if (armed) return;

      armed = true;
      delay = POLL_MS;
      void poll();
    };

    // What `usePollNow` reaches. Re-arming through `stop()` + `sync()` rather
    // than polling directly, so a poke lands on the same single chain instead
    // of racing a second one against it.
    poke.current = () => {
      stop();
      sync();
    };

    sync();
    document.addEventListener('visibilitychange', sync);

    return () => {
      live = false;
      poke.current = () => {};
      stop();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return { state, pollNow };
}

export function CurrentJobProvider({ children }: { children: ReactNode }) {
  const { state, pollNow } = useJobPoller();

  return (
    <PollNowContext.Provider value={pollNow}>
      <CurrentJobContext.Provider value={state}>{children}</CurrentJobContext.Provider>
    </PollNowContext.Provider>
  );
}

/**
 * How long the job has been going, or how long it took.
 *
 * `Date.now()` is read in an effect rather than during render: the first client
 * render has to match the server's, and a running job's elapsed time is the one
 * value on this page that cannot.
 */
function useElapsed(job: HistoryRecord, running: boolean): string | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!running) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = () => setNow(Date.now());

    /* The same rule the poller keeps: a hidden tab is not reading a clock. The
       tick is re-run on the way back rather than merely resumed, so the number
       is right on the first painted frame instead of catching up a second
       later. */
    const sync = () => {
      if (document.visibilityState !== 'visible') {
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        return;
      }

      if (timer !== undefined) return;

      tick();
      timer = setInterval(tick, 1000);
    };

    sync();
    document.addEventListener('visibilitychange', sync);

    return () => {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running, job.id]);

  if (!running) {
    const took = durationOf(job.startedAt, job.endedAt);

    return took === null ? null : formatDuration(took);
  }

  if (now === null) return null;

  const since = now - Date.parse(job.startedAt);

  return Number.isNaN(since) || since < 0 ? null : formatDuration(since);
}

interface JobViewProps extends CurrentJobState {
  /** Narrowed: the empty state is the region's answer when there is no job. */
  job: HistoryRecord;
}

function JobView({ job, running, reportExists, log }: JobViewProps) {
  const elapsed = useElapsed(job, running);
  const { word, tone } = jobState(job.exitCode, running);

  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center" wrap className="vd-job">
        <span className={`vd-outcome vd-outcome--${tone}`}>{word}</span>
        <span className="vd-mono">{job.mode}</span>
        <span className="vd-job__label" title={job.label}>
          {job.label}
        </span>
        {/* `aria-live="off"`, the same opt-out `LogTail` takes one line below
            and for the same reason. This span sits inside the panel's polite
            region, `useElapsed` re-renders it once a second, and
            `formatDuration` floors to seconds — so the text genuinely changes on
            every tick, and a screen reader reads the whole region out again each
            time: "running capture main 42s", "…43s", "…44s", for the length of a
            capture. The region exists to announce the state word, the job and
            its outcome; the timer is a figure to read on demand, not an event.
            `off` rather than `aria-hidden`, deliberately: hidden would take the
            elapsed time out of the accessibility tree altogether, which is a
            worse answer than not announcing it. */}
        {elapsed && (
          <span aria-live="off" className="vd-job__figure">
            {elapsed}
          </span>
        )}
        {job.exitCode !== null && (
          <span className="vd-job__figure">exit {job.exitCode}</span>
        )}
      </Stack>

      {log.length > 0 && <LogTail lines={log} />}

      {/* Only once the run is over, only when it wrote one, and only while that
          report is still there: a report directory mid-run holds a summary
          nothing has finished writing, and one deleted since the run ended is an
          id this row will carry forever (see the route for who answers that). */}
      {!running && job.reportId && reportExists && (
        <Link as={NextLink} href={`/report/${job.reportId}`}>
          view report
        </Link>
      )}
    </Stack>
  );
}

/**
 * The panel itself.
 *
 * It brings its own section rather than borrowing the dashboard's `Panel`,
 * because two of its attributes are the component's contract: the live region
 * that announces a job ending, and an accessible name the acceptance scenarios
 * pin. Both belong in the file a reader opens to find out how the current job is
 * presented.
 */
export function CurrentJob() {
  const state = useCurrentJob();
  const titleId = `${CURRENT_JOB_ANCHOR}-title`;

  return (
    <section
      id={CURRENT_JOB_ANCHOR}
      role="region"
      aria-labelledby={titleId}
      aria-live="polite"
      className="vd-panel"
    >
      <Stack gap={4}>
        <h2 className="vd-panel__title" id={titleId}>
          {CURRENT_JOB_TITLE}
        </h2>

        {state.job === null ? (
          <EmptyState message={NOTHING_RUNNING} />
        ) : (
          <JobView
            job={state.job}
            running={state.running}
            reportExists={state.reportExists}
            log={state.log}
          />
        )}
      </Stack>
    </section>
  );
}

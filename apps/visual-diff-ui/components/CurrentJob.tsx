'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { EmptyState, Link, Stack } from '@gate/ui';
import type { HistoryRecord } from '@/lib/jobs';
import {
  type OutcomeTone,
  durationOf,
  formatDuration,
  outcomeOf,
  outcomeTone,
} from '@/lib/outcome';
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

export interface CurrentJobState {
  running: boolean;
  /** The running job, or the last one to finish. Null on an instance that has
   *  never run anything. */
  job: HistoryRecord | null;
  /** The tail of that job's log, oldest line first. */
  log: readonly string[];
}

const IDLE: CurrentJobState = { running: false, job: null, log: [] };

const CurrentJobContext = createContext<CurrentJobState>(IDLE);

/** What the console's client islands know about the runner. */
export const useCurrentJob = (): CurrentJobState => useContext(CurrentJobContext);

/**
 * One poll, or null when the console could not get an answer.
 *
 * A failed poll is deliberately not an error state on screen: everything else on
 * this page is server-rendered and still true, and a fetch that failed once is
 * tried again on the next tick. `no-store` because every field is about right
 * now — a cached answer is a finished job reported as running.
 */
async function readCurrent(): Promise<CurrentJobState | null> {
  try {
    const response = await fetch(CURRENT_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<CurrentJobState>;

    return {
      running: body.running === true,
      job: body.job ?? null,
      log: Array.isArray(body.log) ? body.log : [],
    };
  } catch {
    return null;
  }
}

export function CurrentJobProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CurrentJobState>(IDLE);
  const router = useRouter();
  // Whether the previous poll saw a job. The transition — and only the
  // transition — is what the server-rendered tables around this need to hear
  // about: a job that ended wrote a history row, and maybe a report and a set.
  const wasRunning = useRef(false);
  // The router held through a ref rather than named as a dependency below: the
  // interval must be established once, and an effect that lists the router
  // restarts its poll on every state change the poll itself caused.
  const latestRouter = useRef(router);

  useEffect(() => {
    latestRouter.current = router;
  }, [router]);

  useEffect(() => {
    let live = true;

    const poll = async () => {
      const next = await readCurrent();
      if (!live || !next) return;

      setState(next);
      if (wasRunning.current && !next.running) latestRouter.current.refresh();
      wasRunning.current = next.running;
    };

    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <CurrentJobContext.Provider value={state}>{children}</CurrentJobContext.Provider>
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

    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, [running, job.id]);

  if (!running) {
    const took = durationOf(job.startedAt, job.endedAt);

    return took === null ? null : formatDuration(took);
  }

  const since = now === null ? null : now - Date.parse(job.startedAt);

  return since === null || Number.isNaN(since) || since < 0
    ? null
    : formatDuration(since);
}

/** The four outcome tones a finished run is drawn in, plus the one a live job
 *  needs: `running` is a state, not a verdict, so it takes the accent rather
 *  than borrowing success or warning. */
type JobTone = OutcomeTone | 'accent';

/** The state word beside the job: what it is doing, or what it came to. A
 *  running job has no exit code yet, and `outcomeOf(null)` reads `interrupted` —
 *  a verdict on a job that is very much alive. */
function stateOf(job: HistoryRecord, running: boolean): { word: string; tone: JobTone } {
  if (running) return { word: 'running', tone: 'accent' };

  const outcome = outcomeOf(job.exitCode);

  return { word: outcome, tone: outcomeTone(outcome) };
}

interface JobViewProps extends CurrentJobState {
  /** Narrowed: the empty state is the region's answer when there is no job. */
  job: HistoryRecord;
}

function JobView({ job, running, log }: JobViewProps) {
  const elapsed = useElapsed(job, running);
  const { word, tone } = stateOf(job, running);

  return (
    <Stack gap={3}>
      <Stack direction="row" gap={3} align="center" wrap className="vd-job">
        <span className={`vd-outcome vd-outcome--${tone}`}>{word}</span>
        <span className="vd-mono">{job.mode}</span>
        <span className="vd-job__label" title={job.label}>
          {job.label}
        </span>
        {elapsed && <span className="vd-job__figure">{elapsed}</span>}
        {job.exitCode !== null && (
          <span className="vd-job__figure">exit {job.exitCode}</span>
        )}
      </Stack>

      {log.length > 0 && <LogTail lines={log} />}

      {/* Only once the run is over, and only when it wrote one: a report
          directory mid-run holds a summary nothing has finished writing. */}
      {!running && job.reportId && (
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
          <JobView job={state.job} running={state.running} log={state.log} />
        )}
      </Stack>
    </section>
  );
}

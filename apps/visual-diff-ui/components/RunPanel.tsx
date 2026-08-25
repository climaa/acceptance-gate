'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { Button, CodeBlock, IconButton, Spinner, Stack } from '@gate/ui';
import { useDismissedJob } from '@/hooks/useDismissedJob';
import { useMutation } from '@/hooks/useMutation';
import { useReviewMarks } from '@/hooks/useReviewMarks';
import { Note } from './Note';
import {
  ACCEPT_COMMAND,
  ACCEPT_IMAGE,
  type AcceptGate,
  acceptGate,
} from '@/lib/accept-gate';
import type { ReportListEntry } from '@/lib/data';
import type { RunnerEnv } from '@/lib/host';
import type { StoryTier } from '@/lib/stories';
import { CURRENT_JOB_ANCHOR, useCurrentJob, usePollNow } from './CurrentJob';
import { FilterPicker } from './FilterPicker';

/**
 * Start a job — the console's write half, and a front for a CLI it is honest
 * about being. Flag names appear verbatim: `--filter` is spelled the way a
 * reviewer would type it, because what this panel does is compose an invocation.
 *
 * Three modes, and exactly the three the runner has. Two decisions live here:
 *
 *  - D1, one job at a time. While the lock is held there is no start button at
 *    all — in its place stands the refusal the server would have answered a
 *    second start with, announced, with a link to the region that shows what is
 *    running. A second start would be refused anyway (`POST /api/jobs` answers
 *    409), so offering the click would be offering a refusal; saying nothing at
 *    all would be a console that has silently stopped working.
 *  - D3, accept is container-bound. The CLI's `accept` has no host guard — run
 *    bare-metal it silently writes host-rendered baselines and stamps them as
 *    pinned-container output. This panel is that guard: off the pinned image the
 *    run button is absent from the DOM rather than disabled, and the mode
 *    degrades to a copyable `docker run`. The server refuses the same request
 *    independently (lib/accept-gate.ts says why that is not redundant).
 *
 * **Which tab is selected is in the URL.** `?mode=compare|accept`, written on
 * every selection and read back on every render — so a reviewer can send someone
 * the panel they are looking at, and a reload does not drop them back on capture.
 * Capture is spelled by the param's ABSENCE, the way `ReportResults` leaves its
 * defaults out: no `mode` already means capture, so writing it would be a param
 * that changes nothing. `a` and `b` ride along untouched, because leaving compare
 * is not abandoning the pair that was chosen.
 *
 * The fingerprint it gates on comes from `GET /api/env`. This bundle never reads
 * `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` — the seam is server-side, so a test world
 * drives the whole decision from one variable and the client cannot disagree
 * with the server about what host it is on.
 */

/**
 * Three, and exactly the three the runner has.
 *
 * There were four. `run` sat between `compare` and `accept` and did what
 * `capture` does — `runCheck` takes the mode and has never read it — so the
 * strip offered a choice with one outcome, and the filter note under both tabs
 * said the same sentence because it was describing the same job.
 */
const MODES = ['capture', 'compare', 'accept'] as const;

type Mode = (typeof MODES)[number];

const isMode = (value: string | null): value is Mode =>
  MODES.some((mode) => mode === value);

const PANEL_ID = 'vd-run-fields';

const tabId = (mode: Mode) => `vd-tab-${mode}`;

/** Placeholders end in an ellipsis so a shape can never be read as a value. Only
 *  the label is typed now — `--filter` is ticked off the corpus (FilterPicker). */
const PLACEHOLDER = {
  label: 'main-2026-08-17…',
};

/** Sample mode explains itself, and the deployed case does not appear here: an
 *  instance can be both, and "there is no CLI behind this" is the sentence that
 *  belongs to the deployment (REMOTE_REFUSAL below), not to a local console that
 *  simply has not been pointed at any data yet. */
const SAMPLE_NOTE =
  'sample mode — this instance is serving the committed sample run, which belongs to this repo rather than to anything captured here; point VISUAL_DIFF_DATA_DIR at a real tree to start a job';

const NO_REPORT = 'No report to accept from — compare two capture sets first.';

/**
 * D1's refusal, in the words the server would have used.
 *
 * Spelled here rather than imported: `lib/refusals.ts` — where this sentence
 * belongs and where `POST /api/jobs` reads it from — reaches the filesystem
 * through `lib/jobs.ts`, and this is a client component. `__tests__/run-panel`
 * pins the two against each other, so the duplication is under a test rather
 * than under a convention.
 */
export const RUNNING_REFUSAL = 'a job is already running';

/** The Docker reminder, spelled here for the same reason and pinned against
 *  `DOCKER_DOWN` by the same test. Not a refusal after the fact: the button it
 *  sits above is disabled, so the reviewer starts Docker instead of a job. */
export const DOCKER_REFUSAL = `this job runs inside ${ACCEPT_IMAGE}, and Docker is not running — start Docker and this comes back`;

/**
 * What the wand says when it cannot name a set.
 *
 * Deliberately silent about WHY, because two different failures reach it and the
 * panel cannot tell them apart: a checkout with no branch a label can be built
 * from, and an endpoint that did not answer. Naming either one would be a guess
 * printed as a diagnosis — and the reviewer's next move is the same either way.
 *
 * `role="status"` where it is drawn, never `role="alert"`: this panel already
 * argues that case twice below, and `apps/e2e/pages/console.ts` reads every
 * refusal through `getByRole('main').getByRole('alert')` strictly. The nearer
 * precedent is `vd-accept__pending`, which says "checking what this host is…"
 * the same way.
 *
 * Saying nothing at all was the other option and is the worse one: a control
 * that swallows a press is a console that has quietly stopped working.
 */
export const SUGGEST_REFUSAL =
  'the console could not suggest a name — type the label instead';

/** The deployed refusal, spelled here for the same reason and pinned against
 *  `NOT_LOCAL` by the same test. */
export const REMOTE_REFUSAL =
  'this console is deployed, and a job needs the checkout it compares — start one from the console on your own machine (`pnpm --filter @gate/visual-diff-ui dev`)';

/** One text field. `spellcheck` off on all of them: every value here is an id, a
 *  label or a substring of a story name, and none of them is prose. */
function Field({
  name,
  label,
  value,
  placeholder,
  onChange,
  disabled,
  action,
}: {
  name: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** What stands to the right of the input, outside it. Only the label field has
   *  one; the wrapper below is unconditional anyway, so the compare fields
   *  cannot drift into a second shape while nobody is looking. */
  action?: ReactNode;
}) {
  const id = `vd-run-${name}`;

  return (
    <Stack gap={1} className="vd-field">
      <label className="vd-field__label" htmlFor={id}>
        {label}
      </label>
      <div className="vd-field__control">
        <input
          id={id}
          name={name}
          type="text"
          className="vd-field__input"
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {action}
      </div>
    </Stack>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="vd-alert">
      <p className="vd-alert__line">{children}</p>
    </div>
  );
}

const step = (from: Mode, by: number) =>
  MODES[(MODES.indexOf(from) + by + MODES.length) % MODES.length] as Mode;

/** Which mode a key moves to from the one selected, or nothing for a key the
 *  tablist does not own. Wrapping, both axes: the strip reads as a row and stacks
 *  to a column below 768 px. */
const KEYS: Record<string, (from: Mode) => Mode> = {
  ArrowRight: (from) => step(from, 1),
  ArrowDown: (from) => step(from, 1),
  ArrowLeft: (from) => step(from, -1),
  ArrowUp: (from) => step(from, -1),
  Home: () => MODES[0],
  End: () => MODES[MODES.length - 1] as Mode,
};

/** The mode tabs. One tab stop for the three of them, arrows between: a tablist
 *  where every tab is tabbable puts three stops in front of the fields. */
function ModeTabs({ mode, onSelect }: { mode: Mode; onSelect: (mode: Mode) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = KEYS[event.key]?.(mode);
    if (!next) return;

    onSelect(next);
    // Focus follows the selection, because the roving `tabIndex` below is about
    // to make the tab under it untabbable: leaving focus there would send the
    // next Tab out of the tablist from a stop that no longer exists.
    event.currentTarget.querySelector<HTMLButtonElement>(`#${tabId(next)}`)?.focus();
    event.preventDefault();
  };

  return (
    <div role="tablist" aria-label="job mode" className="vd-tabs" onKeyDown={onKeyDown}>
      {MODES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          role="tab"
          id={tabId(candidate)}
          aria-controls={PANEL_ID}
          aria-selected={candidate === mode}
          tabIndex={candidate === mode ? 0 : -1}
          className={`vd-tab${candidate === mode ? ' vd-tab--selected' : ''}`}
          onClick={() => onSelect(candidate)}
        >
          {candidate}
        </button>
      ))}
    </div>
  );
}

/** What the runner is, beside what the baselines require. Two rows rather than a
 *  verdict, because a reviewer looking at a refused accept needs to see which of
 *  the two is not what they expected. */
function Fingerprints({ runner }: { runner: RunnerEnv }) {
  return (
    <dl className="vd-fingerprints">
      <dt>baselines require</dt>
      <dd className="vd-mono">{ACCEPT_IMAGE}</dd>
      <dt>this runner</dt>
      <dd className="vd-mono">
        {runner.image ?? 'no declared container'} · {runner.platform}/{runner.arch}
      </dd>
    </dl>
  );
}

function CopyableCommand() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(ACCEPT_COMMAND);
      setCopied(true);
    } catch {
      // A browser that refused the clipboard still shows the command; the
      // reviewer selects it themselves.
      setCopied(false);
    }
  };

  return (
    <Stack gap={2}>
      <div data-testid="accept-docker-command" className="vd-accept__command">
        <CodeBlock language="bash">{ACCEPT_COMMAND}</CodeBlock>
      </div>
      <Stack direction="row" gap={3} align="center" wrap>
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          copy command
        </Button>
        {copied && <span className="vd-accept__copied">copied</span>}
      </Stack>
    </Stack>
  );
}

/** What the gate refuses with, or explains itself with. `ready` renders nothing:
 *  the start button below it is the whole answer. */
function GateNotice({ gate }: { gate: AcceptGate }) {
  if (gate.state === 'accessibility') {
    return (
      <Alert>
        this report carries {gate.failures} accessibility failure(s) — reviewing never
        clears one and baselining it would hide it for good, so there is nothing to accept
        here
      </Alert>
    );
  }

  if (gate.state === 'unreviewed') {
    return (
      <Note name="accept gate">
        {gate.total - gate.reviewed} of {gate.total} variants are still unreviewed —
        accept opens once the report has been read through
      </Note>
    );
  }

  return null;
}

/** The form, as one value per field the three modes need between them. */
interface JobForm {
  mode: Mode;
  label: string;
  /** The component filters ticked in the picker — a list, because a reviewer
   *  means every one they ticked and `matchesFilter` reads several as a union. */
  filter: string[];
  baseline: string;
  candidate: string;
  reportId: string;
}

type Patch = Dispatch<Partial<JobForm>>;

interface Prefill {
  /** The PAIR, and deliberately not the mode — see `useJobForm`, where this is
   *  the whole of what keeps the panel from arguing with its own writes. */
  key: string;
  mode: Mode;
  baseline: string;
  candidate: string;
}

/** The pickers' seam and the tabs' own writes, read back:
 *  `?a=<label>&b=<label>&mode=compare`. Null when the URL carries no request this
 *  panel can act on — which is also what a bare `/` means, and why capture needs
 *  no param of its own. */
function readPrefill(params: URLSearchParams): Prefill | null {
  const mode = params.get('mode');
  if (!isMode(mode)) return null;

  const baseline = params.get('a') ?? '';
  const candidate = params.get('b') ?? '';

  return { key: `${baseline}|${candidate}`, mode, baseline, candidate };
}

/**
 * The form's state, the pre-fill folded into it, and the one field that is folded
 * back out — the selected mode, which this hook writes to the URL.
 *
 * A new request from the pickers is applied during render rather than from an
 * effect: an effect would paint the old pair first, and the reviewer would watch
 * the fields they just chose being filled in a second pass. `applied` is what
 * keeps it to once per request — a tab the reviewer picks afterwards is a choice,
 * and the same URL must not take it back.
 *
 * `selectMode` lives in here rather than at the call site because the panel now
 * writes the query string it also reads, and the latch is what keeps it from
 * arguing with itself. The key is the PAIR alone. Two reasons, and the second is
 * the one that bites:
 *
 *  - A write of ours comes back as a pre-fill one render later, carrying whatever
 *    `a` and `b` the URL still holds. Keyed on the pair, that echo is equal to
 *    what is already applied and nothing happens — so a compare field the
 *    reviewer typed into survives every tab click. Keyed on the mode as well, it
 *    would be re-applied and the typing would be overwritten.
 *  - `router.replace` commits asynchronously, so between the click and the new
 *    query string there is at least one render where `useSearchParams()` still
 *    answers with the OLD one. Any scheme that moves the latch forward to the key
 *    it is ABOUT to see finds that stale read unapplied and acts on it — patching
 *    the mode back to what the reviewer just navigated away from. The pair does
 *    not change across that window, so there is no window to get wrong.
 *
 * What this gives up is any mode change arriving with the pair UNCHANGED, and
 * there is one the console can actually make: pressing `compare A ⇄ B` from
 * another tab with that pair already selected. The pickers write
 * `?a=X&b=Y&mode=compare`, the pair equals what is applied, nothing happens — so
 * the URL reads compare while the panel still shows accept, and the press looks
 * swallowed. The TAB has always been inert there; a same-pair request has never
 * re-applied. What is new is that the URL now moves and disagrees with it.
 *
 * The answer is not a cleverer latch — every variant of one reopens the
 * stale-read window above. It is a vocabulary split: the pickers should write a
 * REQUEST this panel consumes and clears, distinct from the STATE it mirrors, at
 * which point the latch stops existing at all. Tracked separately, because doing
 * it halfway here would leave two half-vocabularies instead of one.
 */
function useJobForm(
  params: URLSearchParams,
  reportIds: readonly string[],
): [JobForm, Patch, (mode: Mode) => void] {
  const prefill = readPrefill(params);
  const [form, patch] = useReducer(
    (state: JobForm, update: Partial<JobForm>) => ({ ...state, ...update }),
    {
      mode: prefill?.mode ?? 'capture',
      label: '',
      filter: [],
      baseline: prefill?.baseline ?? '',
      candidate: prefill?.candidate ?? '',
      reportId: reportIds[0] ?? '',
    },
  );
  const [applied, setApplied] = useState(prefill?.key ?? '');
  const router = useRouter();
  const pathname = usePathname();

  if (prefill && prefill.key !== applied) {
    setApplied(prefill.key);
    patch({
      mode: prefill.mode,
      baseline: prefill.baseline,
      candidate: prefill.candidate,
    });
  }

  // The report picker follows the list it is handed. An instance whose first
  // compare finishes while this panel is mounted arrives here with a list the
  // picker's value is not in, and every question the gate below asks is about
  // the report that value names.
  const [firstReport] = reportIds;
  if (firstReport && !reportIds.includes(form.reportId)) {
    patch({ reportId: firstReport });
  }

  const selectMode = (mode: Mode) => {
    const next = new URLSearchParams(params.toString());
    // Capture is the absence of the param, not a value of it — see the header.
    if (mode === 'capture') next.delete('mode');
    else next.set('mode', mode);

    patch({ mode });

    const query = next.toString();
    // `replace`, not `push`: picking a tab corrects where the reviewer already
    // is, and a Back button that walks a tablist is a Back button nobody wants.
    // `scroll: false` for the reason the pickers give — this panel sits well
    // down the page, and choosing a mode must not also send it to the top.
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  return [form, patch, selectMode];
}

/** What this host is, as the server sees it. `undefined` while the answer is in
 *  flight — distinct from a host that declares no image, which is a refusal
 *  rather than a wait. */
function useRunnerFingerprint(): RunnerEnv | undefined {
  const [runner, setRunner] = useState<RunnerEnv | undefined>(undefined);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch('/api/env', { cache: 'no-store' });
        const fingerprint = (await response.json()) as RunnerEnv;
        if (live) setRunner(fingerprint);
      } catch {
        // Unreachable is not a match: the gate reads a null image as the refusal
        // it is, which is the fail-closed answer.
        if (live) {
          setRunner({
            platform: '?',
            arch: '?',
            image: null,
            playwright: null,
            docker: false,
          });
        }
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  return runner;
}

/**
 * The corpus a reviewer ticks from, as `GET /api/stories` answers it.
 *
 * An empty list is a real answer — a checkout with no Storybook build yet — so
 * there is no pending state to distinguish: the picker says what an empty corpus
 * means, and a build that lands is one poll of this away.
 */
function useStories(): StoryTier[] {
  const [tiers, setTiers] = useState<StoryTier[]>([]);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch('/api/stories', { cache: 'no-store' });
        const body = (await response.json()) as { tiers?: StoryTier[] };
        if (live) setTiers(body.tiers ?? []);
      } catch {
        // Unreachable is an empty corpus: the picker then offers nothing to tick,
        // which is a run over everything — the same thing the gate does.
        if (live) setTiers([]);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  return tiers;
}

/**
 * A name for the set about to be captured, asked for when the reviewer asks.
 *
 * On the CLICK, not on mount — the one place this file's fetching hooks differ,
 * and the difference is the whole feature. The answer counts what this instance
 * already holds, and the reviewer's own last capture is the likeliest thing to
 * have changed it: a suggestion resolved at mount would offer `main-2026-08-24`
 * for a set that now exists, `runCheck` would quietly capture into
 * `main-2026-08-24-2` instead (lib/runner.ts), and the field would be naming a
 * directory nobody wrote.
 *
 * `pending` is the whole concurrency story. The button is disabled while a
 * request is out, so there is never a second one to arrive out of order — which
 * is why this needs no `live` flag, and why a failure re-enables rather than
 * latching.
 *
 * Not `useMutation`: this is a GET that changes nothing, and that hook ends
 * every success with `router.refresh()` — re-rendering the whole console
 * because a text field was filled in.
 */
function useLabelSuggestion(apply: (label: string) => void) {
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(false);

  const suggest = async () => {
    setPending(true);
    setRefused(false);

    try {
      const response = await fetch('/api/label', { cache: 'no-store' });
      const body = (await response.json()) as { label?: string | null };

      if (body.label) apply(body.label);
      else setRefused(true);
    } catch {
      // Unreachable degrades to a wand that says so. There is no safe value to
      // fall back on: a name composed in this bundle would be the client
      // disagreeing with the server about a directory the server owns.
      setRefused(true);
    } finally {
      setPending(false);
    }
  };

  return { suggest, pending, refused };
}

/**
 * The glyph, lucide's `wand-sparkles` — the one Board 01 draws in the
 * IconButton tile.
 *
 * Stroked rather than filled, like `Dialog`'s close and unlike `ThemeToggle`'s
 * crescent; `.ds-icon-btn__glyph` sizes it and tints nothing, so `currentColor`
 * carries the button's own state into it either way.
 *
 * No `aria-hidden` here: `IconButton` wraps whatever it is handed in one, which
 * is exactly why that wrapper is the atom's job rather than the caller's.
 */
function WandGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" />
      <path d="m14 7 3 3" />
      <path d="M5 6v4" />
      <path d="M19 14v4" />
      <path d="M10 2v2" />
      <path d="M7 8H3" />
      <path d="M21 16h-4" />
      <path d="M11 3H9" />
    </svg>
  );
}

/** The body `POST /api/jobs` parses, per mode. An empty filter is left out
 *  rather than sent: the differ reads any filter as "only stories matching
 *  this", and an empty one would match nothing. */
function jobRequest(form: JobForm): Record<string, unknown> {
  const { mode } = form;
  if (mode === 'compare') {
    return { mode, baseline: form.baseline, candidate: form.candidate };
  }
  if (mode === 'accept') return { mode, reportId: form.reportId };

  // An empty list is left out rather than sent: the differ reads no filter as the
  // whole corpus, which is what nothing ticked means, and sending `[]` would say
  // the same thing in a second way.
  return form.filter.length > 0
    ? { mode, label: form.label, filter: form.filter }
    : { mode, label: form.label };
}

/** Starting a job, and whatever the server refused it with. The lifecycle is
 *  `useMutation`'s; this names the endpoint and keeps the panel's vocabulary —
 *  one refusal rather than a list, and `starting` rather than `busy`. */
function useStartJob() {
  const { run, refusals, busy, clear } = useMutation();
  const pollNow = usePollNow();
  const { job } = useCurrentJob();
  const { dismiss } = useDismissedJob();

  const start = async (request: Record<string, unknown>) => {
    /* The card is cleared on the CLICK rather than on the answer, which is the
       same thing its own × does. `POST /api/jobs` runs a synchronous `docker
       info` before it answers a capture or an accept — up to three seconds
       (lib/docker.ts) — and for all of it the region would go on showing the
       LAST run's verdict under a button that had already greyed out. A click
       that appears to do nothing, beside a sentence about a different job.

       Never a running one: `StartAction` renders no button while the lock is
       held, so what is put away here is always a finished run. */
    const undoDismissal = job ? dismiss(job.id) : null;

    const result = await run({
      url: '/api/jobs',
      method: 'POST',
      body: request,
      fallback: 'the console could not start that job',
    });

    if (!result.ok) {
      // Nothing is coming to fill the region, and the refusal is already drawn
      // above the button — the run the reviewer was reading is not the price of
      // being told no.
      undoDismissal?.();
      return;
    }

    // The panel below polls, and backs off while the console is idle — which is
    // exactly what it was a moment ago. Without this poke the job just started
    // would not appear until that backed-off timer came round, and the reviewer
    // would be watching a region that says nothing is running.
    pollNow();
  };

  // `clear` is handed back for the same reason both `ConfirmDialogs` call sites
  // take it: a refusal answers the request that earned it, and carrying it into
  // another mode makes the panel say no to a question nobody asked. Accept is
  // the mode where that matters — `GateNotice` draws its own alert there, and a
  // stale one beside it is the two-alert failure below by a second route.
  return { start, refusal: refusals[0] ?? null, starting: busy, clear };
}

/** Whether the form names a job the runner could take. */
function isRunnable(form: JobForm, gate: AcceptGate | null): boolean {
  if (form.mode === 'compare') return Boolean(form.baseline && form.candidate);
  if (form.mode === 'accept') return gate?.state === 'ready';

  return Boolean(form.label);
}

/**
 * Whether accept is refused outright — no button at all, rather than a disabled
 * one.
 *
 * A greyed control invites the reviewer to look for the way to enable it, and
 * for these two there is none: there is no report to accept from, and an
 * accessibility failure is fixed rather than reviewed away. Neither of the other
 * two answers belongs here — an unreviewed report has a disabled button because
 * reading it is exactly the way to enable it, and a machine with no Docker has
 * one because starting Docker is.
 */
function isRefused(form: JobForm, gate: AcceptGate | null, hasReport: boolean): boolean {
  if (form.mode !== 'accept') return false;
  if (!hasReport) return true;

  return gate?.state === 'accessibility';
}

/**
 * What a capture needs from the machine, and whether it has it.
 *
 * `check` guards its own host before it takes a shot — the committed baselines
 * record the platform they were captured on — so off the pinned image the runner
 * borrows that image and captures inside it. Which turns the host question into
 * a Docker question, and that is the one the panel answers up front: a daemon
 * that is down is a start button whose only outcome is a failed job.
 *
 * ACCEPT answers to it too, and that is what makes it three modes rather than
 * two. A promote stamps the machine that wrote it, so off the pinned image it
 * belongs in the container for the same reason a capture does. Only `compare`
 * is native everywhere — it reads PNGs and renders nothing.
 *
 * `undefined` while the fingerprint is in flight is deliberately NOT a refusal:
 * the answer is a moment away, and blocking the button until it lands would make
 * the panel flicker on every load.
 */
function containerState(
  mode: Mode,
  runner: RunnerEnv | undefined,
): 'native' | 'container' | 'no-docker' {
  if (mode === 'compare') return 'native';
  if (runner === undefined || runner.image === ACCEPT_IMAGE) return 'native';

  return runner.docker ? 'container' : 'no-docker';
}

interface FieldsProps {
  form: JobForm;
  patch: Patch;
  /** Sample mode or a deployed console: the composer freezes as a whole rather
   *  than offering a form whose button is not there. */
  disabled: boolean;
  reports: readonly ReportListEntry[];
  runner: RunnerEnv | undefined;
  gate: AcceptGate | null;
  /** The corpus to tick from, from `GET /api/stories`. */
  stories: readonly StoryTier[];
}

/** Capture takes two: what the set will be called, and the one CLI flag this
 *  runner has. The board draws a viewports field and a
 *  `--skip-build` checkbox beside them; neither exists in `visual-diff`'s CLI —
 *  its whole surface is `check | accept` with `--filter` — and the console never
 *  builds Storybook, so both would be controls for something that cannot happen. */
function CaptureFields({ form, patch, disabled, stories }: FieldsProps) {
  // Rendered for `run` as well as `capture` — `ModeFields` falls through to this
  // for both — and the wand belongs to each of them: a run writes a capture set
  // before it compares against one, so the field it fills names the same
  // directory in either mode.
  const { suggest, pending, refused } = useLabelSuggestion((label) => patch({ label }));

  return (
    <>
      <Field
        name="label"
        label="label"
        value={form.label}
        placeholder={PLACEHOLDER.label}
        onChange={(label) => patch({ label })}
        disabled={disabled}
        action={
          <IconButton
            label="suggest a label"
            variant="secondary"
            size="sm"
            // Frozen with the field it stands in — a composer that cannot start
            // a job has no set to name — and while an answer is out, which is
            // what keeps two of them from racing into one input.
            disabled={disabled || pending}
            onClick={() => void suggest()}
          >
            <WandGlyph />
          </IconButton>
        }
      />
      {/* Overwriting whatever was typed is the point rather than a compromise:
          the second press is what a reviewer needs after a capture lands, and a
          wand guarded on "only if empty" could never give them the `-2`. */}
      {refused && (
        <p role="status" aria-label="label suggestion" className="vd-field__status">
          {SUGGEST_REFUSAL}
        </p>
      )}
      <FilterPicker
        tiers={stories}
        value={form.filter}
        onChange={(filter) => patch({ filter })}
        disabled={disabled}
      />
    </>
  );
}

function CompareFields({ form, patch, disabled }: FieldsProps) {
  return (
    <>
      <Field
        name="baseline"
        label="baseline"
        value={form.baseline}
        placeholder={PLACEHOLDER.label}
        onChange={(baseline) => patch({ baseline })}
        disabled={disabled}
      />
      <Field
        name="candidate"
        label="candidate"
        value={form.candidate}
        placeholder={PLACEHOLDER.label}
        onChange={(candidate) => patch({ candidate })}
        disabled={disabled}
      />
    </>
  );
}

/** The accept tab's own fields: which report, what this host is, and what the
 *  gate makes of the pair. */
function AcceptFields({ form, patch, disabled, reports, runner, gate }: FieldsProps) {
  if (reports.length === 0) return <p className="vd-accept__empty">{NO_REPORT}</p>;

  return (
    <Stack gap={4}>
      <Stack gap={1} className="vd-field">
        <label className="vd-field__label" htmlFor="vd-run-report">
          report
        </label>
        <select
          id="vd-run-report"
          name="report"
          className="vd-field__select"
          value={form.reportId}
          disabled={disabled}
          onChange={(event) => patch({ reportId: event.target.value })}
        >
          {reports.map((report) => (
            <option key={report.id} value={report.id}>
              {report.id}
            </option>
          ))}
        </select>
      </Stack>

      {runner && gate ? (
        <>
          <Fingerprints runner={runner} />
          <GateNotice gate={gate} />
        </>
      ) : (
        <p role="status" className="vd-accept__pending">
          checking what this host is…
        </p>
      )}
    </Stack>
  );
}

function ModeFields(props: FieldsProps) {
  if (props.form.mode === 'accept') return <AcceptFields {...props} />;
  if (props.form.mode === 'compare') return <CompareFields {...props} />;

  return <CaptureFields {...props} />;
}

/** What stands where the start button would: the deployed refusal, D1's link
 *  while the lock is held, the container command where this host cannot capture,
 *  nothing at all where accept is refused, the button otherwise. */
function StartAction({
  form,
  gate,
  hasReport,
  isLocal,
  isSample,
  runner,
  disabled,
  starting,
  onStart,
}: {
  form: JobForm;
  gate: AcceptGate | null;
  hasReport: boolean;
  isLocal: boolean;
  isSample: boolean;
  runner: RunnerEnv | undefined;
  disabled: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const { running } = useCurrentJob();

  // Ahead of D1, because a deployed console never holds a lock and asking about
  // one first would read as if it might. Absent rather than disabled, on the same
  // rule as the host gate below: nothing a reviewer can do in this tab makes a
  // deployment be their own machine, so the note names the console that works.
  if (!isLocal) return <Note name="remote console">{REMOTE_REFUSAL}</Note>;

  // Checked before `running`, and the order is load-bearing rather than tidy.
  //
  // `AcceptFields` renders `GateNotice` whatever the runner is doing, and the
  // host and accessibility refusals are drawn as `role="alert"`. This branch
  // draws one too. With `running` first, accept mode on a bare-metal host with a
  // job in flight put both inside `main` at once — and both are pinned by the
  // same strict locator: `console.ts:64` is `getByRole('main').getByRole('alert')`,
  // read by D1 as `refusalAlert` and by the accept scenarios as
  // `acceptHostAlert`. Two matches fail every one of them on strict mode.
  //
  // It is also the better message. `isRefused` is the outright refusals — there
  // is no button, and waiting will not produce one — so telling a reviewer to
  // follow the running job implies a start that finishing the job would unlock.
  // It would not.
  //
  // D1 is untouched: `isRefused` is false for every mode but accept, and false
  // in accept once the gate is `ready`, so the running refusal still renders
  // wherever a start could otherwise have happened.
  if (isRefused(form, gate, hasReport)) return null;

  if (running) {
    // Announced, not merely absent: a control that vanishes without a word is a
    // console that has silently stopped working, and this is the same refusal
    // `POST /api/jobs` would answer a second start with. `role="alert"` is what
    // the acceptance contract pins as D1's surface, here and on the server.
    return (
      <div role="alert" className="vd-run__running">
        {/* Composed directly rather than through `OutcomeWord`: this states the
            condition as a sentence, not as a status word, and the ring is
            `aria-hidden` so it adds nothing to what this alert already says. */}
        <Spinner />
        {RUNNING_REFUSAL} —{' '}
        <a className="vd-run__anchor" href={`#${CURRENT_JOB_ANCHOR}`}>
          follow the running job below
        </a>
      </div>
    );
  }

  // Sample mode is checked first because it is the nearer answer: an instance
  // serving the committed fixtures has no runner to borrow a container for, and
  // its own note already says what would change that.
  const container = isSample ? 'native' : containerState(form.mode, runner);

  return (
    <Stack gap={3}>
      {/* Notes rather than alerts. Both are true on arrival rather than in
          answer to anything the reviewer did, so announcing them assertively on
          every load is not what `role="alert"` is for — and capture is the tab
          this panel opens on, so an alert here would be a second one inside
          `main` on every page, which is what the console page object warns a
          bare `role=alert` lookup cannot survive. */}
      {container === 'container' && (
        <Note name="runs in the container">
          this {form.mode} runs inside {ACCEPT_IMAGE} — the baselines were captured there,
          and shots taken anywhere else are not comparable to them
        </Note>
      )}
      {container === 'no-docker' && (
        <Stack gap={3}>
          <Note name="docker required">{DOCKER_REFUSAL}</Note>
          {/* Accept alone keeps a copyable command, because accept alone has a
              hand-run equivalent worth offering: a capture with no daemon has
              nothing to paste that this panel is not already trying to do. */}
          {form.mode === 'accept' && <CopyableCommand />}
        </Stack>
      )}

      <Button
        variant="primary"
        onClick={onStart}
        disabled={
          disabled || starting || container === 'no-docker' || !isRunnable(form, gate)
        }
      >
        start {form.mode}
      </Button>
    </Stack>
  );
}

export interface RunPanelProps {
  /** Sample instances have no data directory, so every mutation is refused
   *  server-side; the controls say so rather than failing on the click. */
  isSample: boolean;
  /** Whether the request came from the machine running this console (lib/local).
   *  A deployment gets no start control at all — `POST /api/jobs` refuses the
   *  same request independently, so this is the copy rather than the guard. */
  isLocal: boolean;
  /** Newest first — what accept can be run against. */
  reports: readonly ReportListEntry[];
}

export function RunPanel({ isSample, isLocal, reports }: RunPanelProps) {
  const [form, patch, selectMode] = useJobForm(
    useSearchParams(),
    reports.map((entry) => entry.id),
  );
  const runner = useRunnerFingerprint();
  const stories = useStories();
  const { start, refusal, starting, clear } = useStartJob();
  // Read here as well as in `StartAction`, because the two alerts this panel
  // can draw are decided in two different places and only one of them knew.
  const { running } = useCurrentJob();

  // One word for the two reasons a composer is inert. They are different
  // refusals — one is answered above the button, the other instead of it — but a
  // field does not care which of them froze it.
  const frozen = isSample || !isLocal;
  const report = reports.find((entry) => entry.id === form.reportId) ?? null;
  // Read through the store rather than by calling `readReviewed` here, which is
  // what this used to do. Two reasons, and the second is the one that bites:
  //
  //  - `localStorage.getItem` + `JSON.parse` during render is synchronous work
  //    on the render path, and this panel re-renders on every poll.
  //  - reading storage in render is not reactive and not safe for a component
  //    the server renders. It only agreed with the server because `gate` is
  //    null until `/api/env` lands, so nothing derived from the count reached
  //    the first paint — true today, pinned by nothing, and one `runner` change
  //    away from a hydration mismatch. `useSyncExternalStore` is what
  //    `useReviewMarks` exists to provide (see its header).
  //
  // The empty string when there is no report selected asks the store for a
  // report nobody has marked: an empty set, which is the right answer for a
  // gate that is null anyway.
  const { marks } = useReviewMarks(report?.id ?? '');
  const gate =
    report && runner
      ? acceptGate({
          counts: report.counts,
          // Marks live in this browser and nowhere else — the server never sees
          // which variants a reader has opened, and never should.
          reviewed: marks.size,
        })
      : null;

  return (
    <Stack gap={4}>
      <ModeTabs
        mode={form.mode}
        onSelect={(mode) => {
          clear();
          selectMode(mode);
        }}
      />

      <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(form.mode)}>
        <Stack gap={4}>
          <ModeFields
            form={form}
            patch={patch}
            disabled={frozen}
            reports={reports}
            runner={runner}
            gate={gate}
            stories={stories}
          />

          {isSample && <Note name="sample mode">{SAMPLE_NOTE}</Note>}
          {/* Not `{refusal && ...}`. `StartAction` draws `role="alert"` of its
              own while the lock is held, and both land inside `main` — which
              `apps/e2e/pages/console.ts` reads with the strict locator
              `getByRole('main').getByRole('alert')`, so two matches fail every
              refusal scenario on ambiguity rather than on the thing they test.

              Reached by the ordinary path, not a contrived one: a start
              refused with `JOB_RUNNING` sets this, and the poller below sets
              `running` within `POLL_MS` of the same click. D1's link is the
              better of the two — it says the same sentence AND where to watch
              it — so this one yields. */}
          {refusal && !running && <Alert>{refusal}</Alert>}

          <StartAction
            form={form}
            gate={gate}
            hasReport={report !== null}
            isLocal={isLocal}
            isSample={isSample}
            runner={runner}
            disabled={frozen}
            starting={starting}
            onStart={() => void start(jobRequest(form))}
          />
        </Stack>
      </div>
    </Stack>
  );
}

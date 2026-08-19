'use client';

import { useSearchParams } from 'next/navigation';
import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useReducer,
  useState,
} from 'react';
import { Button, CodeBlock, Stack } from '@gate/ui';
import { useMutation } from '@/hooks/useMutation';
import {
  ACCEPT_COMMAND,
  ACCEPT_IMAGE,
  type AcceptGate,
  acceptGate,
} from '@/lib/accept-gate';
import type { ReportListEntry } from '@/lib/data';
import type { RunnerEnv } from '@/lib/host';
import { readReviewed } from '@/lib/review-state';
import type { StoryTier } from '@/lib/stories';
import { CURRENT_JOB_ANCHOR, useCurrentJob } from './CurrentJob';
import { FilterPicker } from './FilterPicker';

/**
 * Start a job — the console's write half, and a front for a CLI it is honest
 * about being. Flag names appear verbatim: `--filter` is spelled the way a
 * reviewer would type it, because what this panel does is compose an invocation.
 *
 * Four modes, and exactly the four the runner has. Two decisions live here:
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
 * The fingerprint it gates on comes from `GET /api/env`. This bundle never reads
 * `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` — the seam is server-side, so a test world
 * drives the whole decision from one variable and the client cannot disagree
 * with the server about what host it is on.
 */

const MODES = ['capture', 'compare', 'run', 'accept'] as const;

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
export const DOCKER_REFUSAL = `this capture runs inside ${ACCEPT_IMAGE}, and Docker is not running — start Docker and this comes back`;

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
}: {
  name: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = `vd-run-${name}`;

  return (
    <Stack gap={1} className="vd-field">
      <label className="vd-field__label" htmlFor={id}>
        {label}
      </label>
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
    </Stack>
  );
}

/** A note the panel explains itself with — never a refusal, which is what
 *  `role="alert"` is for. The name is what a scenario finds it by. */
function Note({ name, children }: { name: string; children: ReactNode }) {
  return (
    <p role="note" aria-label={name} className="vd-note">
      {children}
    </p>
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

/** The mode tabs. One tab stop for the four of them, arrows between: a tablist
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

  if (gate.state === 'host') {
    return (
      <Stack gap={3}>
        <Alert>
          this runner is {gate.image ?? 'not in a declared container'}, not {ACCEPT_IMAGE}{' '}
          — a bare-metal accept silently writes wrong baselines and stamps them as
          container output, so there is no run button here
        </Alert>
        <CopyableCommand />
      </Stack>
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

/** The form, as one value per field the four modes need between them. */
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
  key: string;
  mode: Mode;
  baseline: string;
  candidate: string;
}

/** The pickers' seam, read back: `?a=<label>&b=<label>&mode=compare`. Null when
 *  the URL carries no request this panel can act on. */
function readPrefill(params: URLSearchParams): Prefill | null {
  const mode = params.get('mode');
  if (!isMode(mode)) return null;

  const baseline = params.get('a') ?? '';
  const candidate = params.get('b') ?? '';

  return { key: `${mode}|${baseline}|${candidate}`, mode, baseline, candidate };
}

/**
 * The form's state, and the pre-fill folded into it.
 *
 * A new request from the pickers is applied during render rather than from an
 * effect: an effect would paint the old pair first, and the reviewer would watch
 * the fields they just chose being filled in a second pass. `applied` is what
 * keeps it to once per request — a tab the reviewer picks afterwards is a choice,
 * and the same URL must not take it back.
 */
function useJobForm(
  prefill: Prefill | null,
  reportIds: readonly string[],
): [JobForm, Patch] {
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

  return [form, patch];
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
  const { run, refusals, busy } = useMutation();

  const start = async (request: Record<string, unknown>) => {
    await run({
      url: '/api/jobs',
      method: 'POST',
      body: request,
      fallback: 'the console could not start that job',
    });
  };

  return { start, refusal: refusals[0] ?? null, starting: busy };
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
 * for these two there is none: an accessibility failure is fixed rather than
 * reviewed away, and the host is changed by moving to the container. An
 * unreviewed report is the third answer and deliberately not here — that button
 * exists and is disabled, because reading the report is exactly the way to
 * enable it.
 */
function isRefused(form: JobForm, gate: AcceptGate | null, hasReport: boolean): boolean {
  if (form.mode !== 'accept') return false;
  if (!hasReport) return true;

  return gate?.state === 'host' || gate?.state === 'accessibility';
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
 * `undefined` while the fingerprint is in flight is deliberately NOT a refusal:
 * the answer is a moment away, and blocking the button until it lands would make
 * the panel flicker on every load.
 */
function containerState(
  mode: Mode,
  runner: RunnerEnv | undefined,
): 'native' | 'container' | 'no-docker' {
  if (mode !== 'capture' && mode !== 'run') return 'native';
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

/** capture and run take the same two: what the set will be called, and the one
 *  CLI flag this runner has. The board draws a viewports field and a
 *  `--skip-build` checkbox beside them; neither exists in `visual-diff`'s CLI —
 *  its whole surface is `check | accept` with `--filter` — and the console never
 *  builds Storybook, so both would be controls for something that cannot happen. */
function CaptureFields({ form, patch, disabled, stories }: FieldsProps) {
  return (
    <>
      <Field
        name="label"
        label="label"
        value={form.label}
        placeholder={PLACEHOLDER.label}
        onChange={(label) => patch({ label })}
        disabled={disabled}
      />
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
      {container === 'no-docker' && <Note name="docker required">{DOCKER_REFUSAL}</Note>}

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
  const prefill = readPrefill(useSearchParams());
  const [form, patch] = useJobForm(
    prefill,
    reports.map((entry) => entry.id),
  );
  const runner = useRunnerFingerprint();
  const stories = useStories();
  const { start, refusal, starting } = useStartJob();

  // One word for the two reasons a composer is inert. They are different
  // refusals — one is answered above the button, the other instead of it — but a
  // field does not care which of them froze it.
  const frozen = isSample || !isLocal;
  const report = reports.find((entry) => entry.id === form.reportId) ?? null;
  const gate =
    report && runner
      ? acceptGate({
          counts: report.counts,
          image: runner.image,
          // Marks live in this browser and nowhere else — the server never sees
          // which variants a reader has opened, and never should.
          reviewed: readReviewed(report.id).length,
        })
      : null;

  return (
    <Stack gap={4}>
      <ModeTabs mode={form.mode} onSelect={(mode) => patch({ mode })} />

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
          {refusal && <Alert>{refusal}</Alert>}

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

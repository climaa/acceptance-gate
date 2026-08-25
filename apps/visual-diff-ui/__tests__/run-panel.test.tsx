// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentJobProvider } from '../components/CurrentJob';
import {
  DOCKER_REFUSAL,
  REMOTE_REFUSAL,
  RUNNING_REFUSAL,
  RunPanel,
  SUGGEST_REFUSAL,
} from '../components/RunPanel';
import type { ReportListEntry } from '../lib/data';
import type { HistoryRecord } from '../lib/jobs';
import { DOCKER_DOWN, JOB_RUNNING, NOT_LOCAL } from '../lib/refusals';
import { reviewStorageKey } from '../lib/review-state';
import { refreshCalls, replaceCalls, setSearchParams } from './stubs/next-navigation';

/**
 * The console's write half: the four job modes, the fields behind each of them,
 * and the accept gate the CLI does not have.
 *
 * Everything here is a client surface, so everything here is driven the way the
 * browser drives it: the compare pre-fill arrives as query params (the pickers'
 * only seam), the runner's fingerprint arrives from `GET /api/env` — never from
 * an env var this bundle read — and the review marks arrive from localStorage,
 * where the reader who made them put them.
 */

const REPORT: ReportListEntry = {
  id: 'main-2026-08-17__main-2026-08-13',
  exitCode: 1,
  counts: { unchanged: 100, changed: 6, added: 0, removed: 0, errored: 0, a11y: 0 },
};

const OLDER: ReportListEntry = {
  ...REPORT,
  id: 'main-2026-08-13__main-2026-08-11',
};

const RUNNING: HistoryRecord = {
  id: '2026-08-17T08-00-00Z-capture',
  mode: 'capture',
  label: 'main-2026-08-17',
  startedAt: '2026-08-17T08:00:00Z',
  endedAt: null,
  exitCode: null,
  reportId: null,
};

/** The corpus `GET /api/stories` answers with. Two tiers and three components is
 *  enough to drive a group's none/some/all without restating the real build. */
const CORPUS = [
  {
    tier: 'atoms',
    components: [
      { filter: 'atoms-button', name: 'Button' },
      { filter: 'atoms-badge', name: 'Badge' },
    ],
  },
  { tier: 'molecules', components: [{ filter: 'molecules-card', name: 'Card' }] },
];

interface ApiStub {
  /** What `GET /api/env` says this runner is. */
  image?: string | null;
  /** Whether `GET /api/env` says a container could be started. */
  docker?: boolean;
  /** What `GET /api/stories` says there is to capture. */
  tiers?: typeof CORPUS;
  /** What `GET /api/jobs/current` says is happening. */
  current?: { running: boolean; job: HistoryRecord | null };
  /** What `POST /api/jobs` answers. */
  jobs?: { ok?: boolean; status?: number; body?: unknown };
  /** What `GET /api/label` suggests. `null` is a checkout that cannot name a
   *  set; `'throw'` is the endpoint being unreachable. */
  label?: string | null | 'throw';
}

const answered = (ok: boolean, status: number, body: unknown) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) }) as never;

/** The endpoints this panel talks to, answered per case. An unstubbed URL throws
 *  rather than resolving: a screen quietly reading something this suite never
 *  arranged is exactly what the fingerprint seam must not do. */
function stubApi({
  image = HOST.image,
  docker = true,
  tiers = CORPUS,
  current,
  jobs,
  label = SUGGESTED,
}: ApiStub = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/env') {
      return answered(true, 200, {
        platform: 'linux',
        arch: 'x64',
        image,
        playwright: null,
        docker,
      });
    }
    if (url === '/api/stories') return answered(true, 200, { tiers });
    if (url === '/api/jobs/current') {
      return answered(true, 200, { running: false, job: null, log: [], ...current });
    }
    if (url === '/api/jobs') {
      return answered(
        jobs?.ok ?? true,
        jobs?.status ?? 202,
        jobs?.body ?? { job: RUNNING },
      );
    }
    if (url === '/api/label') {
      // Thrown synchronously, which the hook's `try` catches exactly as it would
      // a rejected fetch — the panel cannot tell the two apart and must not.
      if (label === 'throw') throw new Error('unreachable');

      return answered(true, 200, { label });
    }

    throw new Error(`unstubbed request to ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

interface PanelCase extends ApiStub {
  isSample?: boolean;
  /** Defaults to a local console: every case that is not about the deployed
   *  refusal is about a panel a reviewer can actually press. */
  isLocal?: boolean;
  reports?: ReportListEntry[];
  /** The query string the pickers would have written. */
  query?: string;
}

function renderPanel({
  isSample = false,
  isLocal = true,
  reports = [REPORT],
  query = '',
  ...api
}: PanelCase = {}) {
  const fetchMock = stubApi(api);
  setSearchParams(query);

  render(
    <CurrentJobProvider>
      <RunPanel isSample={isSample} isLocal={isLocal} reports={reports} />
    </CurrentJobProvider>,
  );

  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  localStorage.clear();
  setSearchParams('');
  refreshCalls.length = 0;
  replaceCalls.length = 0;
});

const tab = (name: string) => screen.getByRole('tab', { name });

const selectTab = (name: string) => fireEvent.click(tab(name));

const startButtons = (mode: string) =>
  screen.queryAllByRole('button', { name: `start ${mode}` });

const SUGGESTED = 'main-2026-08-24';

const labelField = () => screen.getByRole('textbox', { name: 'label' });

const wand = () => screen.getByRole('button', { name: 'suggest a label' });

/** The panel, with its two on-mount fetches already settled. Every wand case is
 *  about what the CLICK asks for, so a case that asserted before `/api/env` and
 *  `/api/stories` had landed would be counting their calls as well. */
async function renderSettled(options: PanelCase = {}) {
  const fetchMock = renderPanel(options);
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/stories', expect.anything()),
  );

  return fetchMock;
}

const askedForALabel = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/label').length;

/** The accept tab, once the runner's fingerprint has come back — every gate
 *  below it is a decision about that answer, so a case that asserted before it
 *  arrived would be asserting the "checking this host" state. */
async function openAcceptTab(options: PanelCase = {}) {
  const fetchMock = renderPanel(options);
  selectTab('accept');

  await waitFor(() => expect(screen.queryByRole('status')).toBeNull());

  return fetchMock;
}

describe('the mode tabs', () => {
  // Three, and the count is the assertion. `run` was the fourth and spawned the
  // same job as `capture` — `runCheck` takes a mode and has never read one — so
  // a strip that offers it back is offering a choice with one outcome.
  it('offers exactly the three modes the runner has', () => {
    renderPanel();

    const tabs = screen.getAllByRole('tab');

    expect(tabs.map((mode) => mode.textContent)).toEqual([
      'capture',
      'compare',
      'accept',
    ]);
  });

  it('opens on capture', () => {
    renderPanel();

    expect(tab('capture').getAttribute('aria-selected')).toBe('true');
  });

  it('moves the selection to the tab that was clicked', () => {
    renderPanel();

    selectTab('compare');

    expect(tab('compare').getAttribute('aria-selected')).toBe('true');
    expect(tab('capture').getAttribute('aria-selected')).toBe('false');
  });

  // A tablist is one tab stop: the arrow keys are how the other three are
  // reached, and without them the modes are mouse-only.
  it('moves the selection with the arrow keys', () => {
    renderPanel();

    fireEvent.keyDown(tab('capture'), { key: 'ArrowRight' });

    expect(tab('compare').getAttribute('aria-selected')).toBe('true');
  });

  it('wraps from the last mode back to the first', () => {
    renderPanel();
    selectTab('accept');

    fireEvent.keyDown(tab('accept'), { key: 'ArrowRight' });

    expect(tab('capture').getAttribute('aria-selected')).toBe('true');
  });

  // Selection and focus move together, or the keyboard reader is left on a tab
  // that just became untabbable and the next Tab leaves the tablist from
  // wherever the browser decides.
  it('takes focus with the selection', () => {
    renderPanel();
    tab('capture').focus();

    fireEvent.keyDown(tab('capture'), { key: 'ArrowRight' });

    expect(document.activeElement).toBe(tab('compare'));
  });

  it('names the start button after the mode it would run', () => {
    renderPanel();

    selectTab('compare');

    expect(startButtons('compare')).toHaveLength(1);
  });
});

/**
 * The tab, in the URL.
 *
 * `useSearchParams` in the stub answers with whatever the last `setSearchParams`
 * put there and does not move when `router.replace` is called — which is not a
 * shortcoming here but the interesting half of the contract. `router.replace`
 * commits asynchronously in the real app too, so every render between the click
 * and the new query string reads the OLD one, and these cases are what says the
 * panel survives that window instead of arguing with itself across it.
 */
describe('the selected tab in the URL', () => {
  const PAIR = 'a=main-2026-08-17&b=main-2026-08-13';

  const written = () => replaceCalls.map(({ url }) => url);

  it('writes the mode that was clicked', () => {
    renderPanel();

    selectTab('accept');

    expect(replaceCalls).toEqual([{ url: '/?mode=accept', options: { scroll: false } }]);
  });

  // Capture is what a console with no query string opens on, so writing the
  // param would be adding one that changes nothing — and the reviewer who then
  // shares the link is sharing a longer URL for the same page.
  it('spells capture as the absence of the param', () => {
    renderPanel({ query: 'mode=accept' });

    selectTab('capture');

    expect(written()).toEqual(['/']);
  });

  // Leaving compare is not abandoning the pair that was chosen: the reviewer
  // who clicks back finds it still there, and so does whoever they sent the URL.
  it('carries the compare pair across a tab change', () => {
    renderPanel({ query: `${PAIR}&mode=compare` });

    selectTab('accept');

    expect(written()).toEqual([`/?${PAIR}&mode=accept`]);
  });

  it('writes the mode reached with the arrow keys', () => {
    renderPanel();

    fireEvent.keyDown(tab('capture'), { key: 'ArrowRight' });

    expect(written()).toEqual(['/?mode=compare']);
  });

  // The window: this render reads the query string from BEFORE the click, which
  // still names compare. A panel that treated that as a fresh request would
  // patch the mode straight back and the tab would snap to where the reviewer
  // just left.
  it('holds the new tab through the render before the URL catches up', () => {
    renderPanel({ query: `${PAIR}&mode=compare` });

    selectTab('accept');

    expect(tab('accept').getAttribute('aria-selected')).toBe('true');
  });

  // ...and once it HAS caught up, the panel is reading back its own write. The
  // pair in it is the one the pickers sent, which is no longer what the field
  // says — so a pre-fill that fired here would overwrite the correction with
  // the value the reviewer had just replaced.
  it('leaves a compare field the reviewer typed alone', () => {
    renderPanel({ query: `${PAIR}&mode=compare` });
    const baseline = () => screen.getByRole('textbox', { name: 'baseline' });
    fireEvent.change(baseline(), { target: { value: 'main-2026-08-20' } });

    selectTab('accept');
    setSearchParams(`${PAIR}&mode=accept`);
    selectTab('compare');

    expect(baseline()).toHaveProperty('value', 'main-2026-08-20');
    expect(tab('compare').getAttribute('aria-selected')).toBe('true');
  });
});

describe('starting a job', () => {
  it('posts the capture the fields name', async () => {
    const fetchMock = renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ mode: 'capture', label: 'main-2026-08-17' }),
      }),
    );
  });

  /**
   * The start has to wake the poller, not merely succeed.
   *
   * The current-job region below this panel backs off while the console is idle,
   * which is exactly what it was a moment before a reviewer pressed start. Left
   * to its own timer it would go on saying nothing is running for up to
   * `MAX_IDLE_POLL_MS` after the job began — so `useStartJob` pokes it, and this
   * is the seam where that poke is wired.
   *
   * Counted as polls before and after the POST rather than by watching for the
   * job to appear: what is being held here is that the start ASKED, which is the
   * wiring. Whether a poke collapses a backed-off wait is the poller's own
   * contract, and `current-job.test.tsx` holds that end of it.
   */
  it('asks the poller for a fresh answer once the job is accepted', async () => {
    const fetchMock = renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    const pollsBefore = () =>
      fetchMock.mock.calls.filter(([url]) => url === '/api/jobs/current').length;
    const before = pollsBefore();

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() => expect(pollsBefore()).toBeGreaterThan(before));
  });

  // A start the server refused is not a job, so there is nothing to go and look
  // at — poking the poller for it would spend a request to be told what the
  // refusal already said.
  it('does not ask when the start was refused', async () => {
    const fetchMock = renderPanel({
      jobs: { ok: false, status: 409, body: JOB_RUNNING },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    const polls = () =>
      fetchMock.mock.calls.filter(([url]) => url === '/api/jobs/current').length;
    const before = polls();

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/jobs', expect.anything()),
    );

    expect(polls()).toBe(before);
  });

  // `--filter` is the CLI's own flag, and the only one of the three the composed
  // `check` takes: an empty box must not become a filter matching nothing.
  // Ticked, not typed: `--filter` used to be a text box over a vocabulary that
  // only exists inside a Storybook build.
  it('carries the components that were ticked', async () => {
    const fetchMock = renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /2$/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Button' }));

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            mode: 'capture',
            label: 'main-2026-08-17',
            filter: ['atoms-button'],
          }),
        }),
      ),
    );
  });

  it('has nothing to start until the set is named', () => {
    renderPanel();

    const [start] = startButtons('capture');

    expect(start).toHaveProperty('disabled', true);
  });

  it('re-reads the console once a job is accepted, so the history row shows', async () => {
    renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() => expect(refreshCalls).toEqual(['refresh']));
  });

  // D1 from the other side: the refusal is prose, and it is the server's.
  it('surfaces a refused start in the words the server refused with', async () => {
    renderPanel({ jobs: { ok: false, status: 409, body: { error: JOB_RUNNING } } });
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(JOB_RUNNING);
  });

  /**
   * The two halves of D1's surface, on screen at once.
   *
   * The ordinary sequence, not a contrived one: a start is refused with
   * `JOB_RUNNING` because something else took the lock, and the poller catches
   * up within `POLL_MS` of the same click. The refusal alert above the button
   * and D1's link where the button was are both `role="alert"` inside `main`,
   * and `apps/e2e/pages/console.ts` reads that with a strict locator — so two
   * matches fail every refusal scenario on ambiguity rather than on its subject.
   *
   * The two cases beside this one each render one half and would both stay green
   * with the other alert restored; this is the one that holds them together.
   */
  it('answers a refused start and a running job with one alert, not two', async () => {
    renderPanel({
      jobs: { ok: false, status: 409, body: { error: JOB_RUNNING } },
      current: { running: true, job: RUNNING },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() => expect(startButtons('capture')).toHaveLength(0));

    const alerts = screen.getAllByRole('alert');

    expect(alerts).toHaveLength(1);
    // D1's link survives, not the bare sentence: it says the same thing and
    // where to watch it.
    expect(alerts[0]?.textContent).toContain(JOB_RUNNING);
    expect(
      within(alerts[0] as HTMLElement)
        .getByRole('link')
        .getAttribute('href'),
    ).toBe('#vd-current-job');
  });

  // A refusal answers the request that earned it. Carrying it into another mode
  // makes the panel say no to a question nobody asked — and in `accept`, where
  // `GateNotice` draws its own alert, it is the two-alert failure again.
  it('clears a refusal when the reviewer changes mode', async () => {
    renderPanel({ jobs: { ok: false, status: 409, body: { error: JOB_RUNNING } } });
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));
    expect((await screen.findByRole('alert')).textContent).toBe(JOB_RUNNING);

    selectTab('compare');

    expect(screen.queryByRole('alert')).toBeNull();
  });

  // D1: one job at a time, so while one holds the lock there is nothing to press
  // — only somewhere to go and watch it.
  it('replaces the start button with a link to the running job', async () => {
    renderPanel({ current: { running: true, job: RUNNING } });

    const link = await screen.findByRole('link', { name: /running/ });

    expect(link.getAttribute('href')).toBe('#vd-current-job');
    expect(startButtons('capture')).toHaveLength(0);
  });

  /**
   * Standing where the control was, and announced: a control that vanishes
   * without a word is a console that has silently stopped working, and this is
   * the same refusal `POST /api/jobs` answers a second start with. The
   * acceptance contract pins `role=alert` and this sentence as D1's surface.
   */
  it('announces the refusal in the sentence the server would have used', async () => {
    renderPanel({ current: { running: true, job: RUNNING } });

    const alert = await screen.findByRole('alert');

    expect(alert.textContent).toContain(JOB_RUNNING);
  });

  // The panel is a client component and lib/refusals.ts reaches the filesystem,
  // so the sentence is spelled twice. This is the drift under a test rather
  // than under a convention.
  it('spells that sentence the way lib/refusals.ts does', () => {
    expect(RUNNING_REFUSAL).toBe(JOB_RUNNING);
  });

  // The reviewer reading this is usually working somewhere else on the page —
  // the sets panel, the pickers — and a sentence that never moves is
  // indistinguishable from a stale tab. The ring is the only thing here that
  // says the console is still live.
  it('turns a ring inside that refusal', async () => {
    renderPanel({ current: { running: true, job: RUNNING } });

    const alert = await screen.findByRole('alert');

    expect(alert.querySelector('.ds-spinner')).not.toBeNull();
  });

  /**
   * The ring must not have brought a live region with it.
   *
   * The acceptance suite reads refusals through one strict locator,
   * `getByRole('main').getByRole('alert')` (apps/e2e/pages/console.ts), so a
   * second alert here fails every scenario that reads the first — which is why
   * `Spinner` is `aria-hidden` with no role and no label to override it. Held
   * here because this is the one place in the console where a decorative
   * element was composed INTO an alert.
   */
  it('adds no second announcement to the one alert', async () => {
    renderPanel({ current: { running: true, job: RUNNING } });

    const alert = await screen.findByRole('alert');

    expect(screen.queryAllByRole('alert')).toHaveLength(1);
    // Scoped to the alert on purpose: the panel is allowed a `role="status"`
    // elsewhere (the accept gate has one), and this is a claim about what the
    // ring brought in, not about the panel at large.
    expect(within(alert).queryByRole('status')).toBeNull();
  });
});

/**
 * The wand beside the label field.
 *
 * Everything here is about the CLICK. The suggestion is a claim about what this
 * instance holds right now, and the reviewer's own last capture is the likeliest
 * thing to have changed it — so a panel that resolved a name at mount would be
 * offering one that a capture since then has taken.
 */
describe('the label wand', () => {
  it('fills the label with the name the server suggests', async () => {
    await renderSettled();

    fireEvent.click(wand());

    await waitFor(() => expect(labelField()).toHaveProperty('value', SUGGESTED));
  });

  it('asks when it is asked, not when the panel mounts', async () => {
    const fetchMock = await renderSettled();

    expect(askedForALabel(fetchMock)).toBe(0);

    fireEvent.click(wand());

    await waitFor(() => expect(askedForALabel(fetchMock)).toBe(1));
  });

  // The case the whole on-click decision exists for: between the first press and
  // the second, a capture can land and take the name the first one offered.
  it('asks again on a second press, because a capture may have landed between', async () => {
    const fetchMock = await renderSettled();

    fireEvent.click(wand());
    await waitFor(() => expect(labelField()).toHaveProperty('value', SUGGESTED));

    fireEvent.click(wand());

    await waitFor(() => expect(askedForALabel(fetchMock)).toBe(2));
  });

  // Deliberate, not incidental. A wand guarded on "only if empty" could never
  // hand a reviewer the `-2` after their first capture landed.
  it('replaces a label the reviewer had already typed', async () => {
    await renderSettled();
    fireEvent.change(labelField(), { target: { value: 'typed-by-hand' } });

    fireEvent.click(wand());

    await waitFor(() => expect(labelField()).toHaveProperty('value', SUGGESTED));
  });

  it('says so rather than doing nothing when no name can be had', async () => {
    await renderSettled({ label: null });

    fireEvent.click(wand());

    await waitFor(() => expect(screen.getByText(SUGGEST_REFUSAL)).toBeDefined());
  });

  it('says the same when the endpoint cannot be reached at all', async () => {
    await renderSettled({ label: 'throw' });

    fireEvent.click(wand());

    await waitFor(() => expect(screen.getByText(SUGGEST_REFUSAL)).toBeDefined());
  });

  // The rule this panel argues twice elsewhere: `apps/e2e/pages/console.ts` reads
  // every refusal through `getByRole('main').getByRole('alert')` strictly, so a
  // second alert inside the page fails every scenario that reads the first.
  it('says it as a status, so it does not become a second alert on the page', async () => {
    await renderSettled({ label: null });

    fireEvent.click(wand());

    await waitFor(() => expect(screen.getByText(SUGGEST_REFUSAL)).toBeDefined());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status', { name: 'label suggestion' })).toBeDefined();
  });

  // Compare names two sets that already exist. A FREE label is the wrong answer
  // there by definition.
  it('draws none beside the two labels a compare names', async () => {
    await renderSettled();

    selectTab('compare');

    expect(screen.queryByRole('button', { name: 'suggest a label' })).toBeNull();
  });

  it('is frozen with the field it belongs to in sample mode', async () => {
    await renderSettled({ isSample: true });

    expect(wand()).toHaveProperty('disabled', true);
  });

  it('is frozen on a deployed console too', async () => {
    await renderSettled({ isLocal: false });

    expect(wand()).toHaveProperty('disabled', true);
  });
});

describe('the compare pre-fill', () => {
  const QUERY = 'a=main-2026-08-17&b=main-2026-08-13&mode=compare';

  it('opens on the tab the pickers asked for', () => {
    renderPanel({ query: QUERY });

    expect(tab('compare').getAttribute('aria-selected')).toBe('true');
  });

  it('fills both labels from the URL the pickers wrote', () => {
    renderPanel({ query: QUERY });

    expect(screen.getByRole('textbox', { name: 'baseline' })).toHaveProperty(
      'value',
      'main-2026-08-17',
    );
    expect(screen.getByRole('textbox', { name: 'candidate' })).toHaveProperty(
      'value',
      'main-2026-08-13',
    );
  });

  it('compares the pair the URL named', async () => {
    const fetchMock = renderPanel({ query: QUERY });

    fireEvent.click(screen.getByRole('button', { name: 'start compare' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            mode: 'compare',
            baseline: 'main-2026-08-17',
            candidate: 'main-2026-08-13',
          }),
        }),
      ),
    );
  });

  // The other side of every echo case in `the selected tab in the URL`: a pair
  // the panel did NOT write is a fresh request from the pickers, and it wins —
  // including over a field mid-edit, because a reviewer who just asked for a
  // different comparison is no longer editing the old one. Without this the
  // latch could be stuck shut and every echo case would still pass.
  it('applies a pair that arrives after the panel is mounted', () => {
    renderPanel({ query: QUERY });
    const field = (name: string) => screen.getByRole('textbox', { name });

    setSearchParams('a=main-2026-08-12&b=main-2026-08-11&mode=compare');
    // Any render will do; the reviewer's next keystroke is the realistic one.
    fireEvent.change(field('baseline'), { target: { value: 'mid-edit' } });

    expect(field('baseline')).toHaveProperty('value', 'main-2026-08-12');
    expect(field('candidate')).toHaveProperty('value', 'main-2026-08-11');
  });

  // A tab the reviewer chose is a choice, and a pre-fill that has not changed
  // must not take it back.
  it('leaves a tab the reviewer chose afterwards alone', () => {
    renderPanel({ query: QUERY });

    selectTab('capture');

    expect(tab('capture').getAttribute('aria-selected')).toBe('true');
  });
});

describe('sample mode', () => {
  it('disables the start button', () => {
    renderPanel({ isSample: true });

    const [start] = startButtons('capture');

    expect(start).toHaveProperty('disabled', true);
  });

  // The variable is the whole of the fix, so it is the whole of the sentence.
  // It deliberately says nothing about deployments: a local console with no data
  // directory is in sample mode too, and that is the reader this note is for.
  it('names the one thing that would take it out of sample mode', () => {
    renderPanel({ isSample: true });

    const note = screen.getByRole('note', { name: 'sample mode' });

    expect(note.textContent).toMatch(/VISUAL_DIFF_DATA_DIR/);
  });
});

/**
 * The capture modes off the pinned container.
 *
 * `check` guards its own host before it takes a shot, so the runner borrows the
 * pinned image and captures inside it. Which turns the host question into a
 * Docker question — and that is the one this panel answers before the button is
 * pressed, because a daemon that is down is a start button whose only outcome is
 * a failed job.
 */
describe('capture on a host that is not the pinned container', () => {
  it.each(['capture'])('says the %s will run in the container', async (mode) => {
    renderPanel({ image: null, docker: true });
    selectTab(mode);

    const note = await screen.findByRole('note', { name: 'runs in the container' });

    expect(note.textContent).toContain(HOST.image);
    expect(startButtons(mode)).toHaveLength(1);
  });

  // The reminder, and the whole reason the panel asks: pressing a button that
  // can only fail is what this replaces.
  it.each(['capture'])('disables %s while docker is down', async (mode) => {
    renderPanel({ image: null, docker: false });
    selectTab(mode);

    await screen.findByRole('note', { name: 'docker required' });
    const [start] = startButtons(mode);

    expect(start).toHaveProperty('disabled', true);
  });

  it('says what to start, in the words the server would have used', () => {
    expect(DOCKER_REFUSAL).toBe(DOCKER_DOWN);
  });

  // compare reads two shot trees off disk and moves no pixels, so neither the
  // host nor the daemon is a question it has to ask.
  it('leaves compare alone', async () => {
    renderPanel({ image: null, docker: false });
    selectTab('compare');

    await waitFor(() => expect(startButtons('compare')).toHaveLength(1));
    expect(screen.queryByRole('note', { name: 'docker required' })).toBeNull();
  });

  // A console already on the pinned image has no container to borrow, so there
  // is nothing to say and nothing to wait for.
  it('says nothing on the pinned image itself', async () => {
    renderPanel({ image: HOST.image, docker: false });

    await waitFor(() => expect(startButtons('capture')).toHaveLength(1));
    expect(screen.queryByRole('note', { name: 'runs in the container' })).toBeNull();
    expect(screen.queryByRole('note', { name: 'docker required' })).toBeNull();
  });

  // Sample mode is the nearer answer: an instance serving the committed fixtures
  // has no runner to borrow a container for, and its own note already says what
  // would change that. The e2e sample world asserts a DISABLED button here.
  it('leaves sample mode saying what sample mode says', async () => {
    renderPanel({ isSample: true, image: null, docker: false });

    await waitFor(() => expect(startButtons('capture')).toHaveLength(1));
    expect(screen.getByRole('note', { name: 'sample mode' })).toBeDefined();
    expect(screen.queryByRole('note', { name: 'docker required' })).toBeNull();
  });

  // Capture is the tab the panel opens on, so an alert here would be a second
  // `role="alert"` inside the console's `main` on every page load — which is
  // what the e2e page object's refusal lookup cannot survive.
  it('is a note, so it does not become a second alert on the page', async () => {
    renderPanel({ image: null, docker: false });

    await screen.findByRole('note', { name: 'docker required' });

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });
});

/**
 * The local gate. A deployment has no checkout to compare, no Storybook build to
 * serve and no browser to drive, so there is nothing a reviewer could do in this
 * tab to make the button work — which is the rule `isRefused` states for the
 * host gate, applied one level up: absent, not disabled.
 */
describe('a deployed console', () => {
  it('offers no start button at all', () => {
    renderPanel({ isLocal: false });

    expect(startButtons('capture')).toHaveLength(0);
  });

  it('names the console that can run the job instead', () => {
    renderPanel({ isLocal: false });

    const note = screen.getByRole('note', { name: 'remote console' });

    expect(note.textContent).toBe(REMOTE_REFUSAL);
  });

  // The panel spells the sentence rather than importing it — `lib/refusals`
  // reaches the filesystem and this is a client bundle — so the duplication is
  // held here rather than by a convention. Same bargain as RUNNING_REFUSAL.
  it('says what the server would have answered', () => {
    expect(REMOTE_REFUSAL).toBe(NOT_LOCAL);
  });
});

describe('the accept gate', () => {
  it('names the report it would accept from', async () => {
    await openAcceptTab();

    expect(screen.getByRole('combobox', { name: 'report' })).toHaveProperty(
      'value',
      REPORT.id,
    );
  });

  it('holds accept closed while variants remain unreviewed', async () => {
    await openAcceptTab();

    const [start] = startButtons('accept');
    expect(start).toHaveProperty('disabled', true);
    expect(screen.getByRole('note', { name: 'accept gate' }).textContent).toMatch(
      /unreviewed/,
    );
  });

  it('opens accept once every variant of the report is reviewed', async () => {
    localStorage.setItem(
      reviewStorageKey(REPORT.id),
      JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']),
    );

    await openAcceptTab();

    const [start] = startButtons('accept');
    expect(start).toHaveProperty('disabled', false);
  });

  // The gate is per report, so the picker is not a convenience: switching it
  // re-asks every question below with the other report's counts and marks.
  it('accepts the report the picker names', async () => {
    localStorage.setItem(
      reviewStorageKey(OLDER.id),
      JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']),
    );
    const fetchMock = await openAcceptTab({ reports: [REPORT, OLDER] });
    fireEvent.change(screen.getByRole('combobox', { name: 'report' }), {
      target: { value: OLDER.id },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start accept' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs',
        expect.objectContaining({
          body: JSON.stringify({ mode: 'accept', reportId: OLDER.id }),
        }),
      ),
    );
  });

  // A fresh instance's first compare finishes while this panel is open: the
  // reports arrive as a prop on a panel that is already mounted, and a picker
  // still naming nothing would leave the gate asking about a report the list
  // does not hold.
  it('picks up a report list that arrived after it mounted', async () => {
    const panel = (reports: readonly ReportListEntry[]) => (
      <CurrentJobProvider>
        <RunPanel isSample={false} isLocal reports={reports} />
      </CurrentJobProvider>
    );
    stubApi();
    const { rerender } = render(panel([]));
    selectTab('accept');

    rerender(panel([REPORT]));

    // The gate asks every one of its questions about the report the picker
    // names: with the picker still naming nothing, the tab sits on "checking
    // what this host is" for as long as it is open.
    expect(await screen.findByRole('note', { name: 'accept gate' })).toBeDefined();
  });

  it('has nothing to accept on an instance that has compared nothing', async () => {
    await openAcceptTab({ reports: [] });

    expect(startButtons('accept')).toHaveLength(0);
    expect(screen.getByText(/no report to accept/i)).toBeDefined();
  });
});

describe('the accept gate off the pinned container', () => {
  /** No declared image and no daemon: the one machine answer a button cannot
   *  solve, and the only one accept still degrades to a command for. */
  const CASE: PanelCase = { image: null, docker: false };

  /** Every case below is a report that has already been read through. An
   *  unreviewed one is held at the review gate instead — the answer a reviewer
   *  can still act on. */
  beforeEach(() => {
    localStorage.setItem(
      reviewStorageKey(REPORT.id),
      JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']),
    );
  });

  /**
   * The button is there and disabled, not absent.
   *
   * Off the pinned image accept used to have no button at all, because a promote
   * stamps the machine that wrote it and there was no way to run it anywhere
   * else. The console now starts the pinned container itself — so what is left
   * to refuse is having no daemon to start it with, and that is a disabled
   * control with a note saying which switch to throw, exactly as capture has.
   */
  it('offers the button disabled rather than withholding it', async () => {
    await openAcceptTab(CASE);

    await waitFor(() => expect(startButtons('accept')).toHaveLength(1));
    expect(startButtons('accept')[0]).toHaveProperty('disabled', true);
    expect(screen.getByRole('note', { name: 'docker required' })).toBeDefined();
  });

  // The whole point of the change, and the case that would have caught the old
  // behaviour: a machine that CAN start the container gets a live button.
  it('offers a live button on a host that has a daemon', async () => {
    await openAcceptTab({ image: null, docker: true });

    await waitFor(() => expect(startButtons('accept')).toHaveLength(1));
    expect(startButtons('accept')[0]).toHaveProperty('disabled', false);
    expect(screen.getByRole('note', { name: 'runs in the container' })).toBeDefined();
  });

  it('degrades to the container command, copyable, when there is no daemon', async () => {
    await openAcceptTab(CASE);

    const command = screen.getByTestId('accept-docker-command');

    expect(command.textContent).toContain(HOST.image);
    expect(command.textContent).toContain('node packages/visual-diff/src/cli.mjs accept');
    expect(screen.getByRole('button', { name: 'copy command' })).toBeDefined();
  });

  it('copies the command a reviewer would otherwise retype', async () => {
    // jsdom ships no clipboard at all, and `vi.stubGlobal('navigator', …)` would
    // take `userAgent` with it — the property is defined onto the real navigator
    // and removed again in this file's `afterEach`.
    const writeText = vi.fn((text: string) => Promise.resolve(text));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await openAcceptTab(CASE);

    fireEvent.click(screen.getByRole('button', { name: 'copy command' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain(HOST.image);
  });

  /**
   * One `role="alert"` inside `main`, ever.
   *
   * Two would break every scenario on either side of it: the e2e suite reads
   * this region with one strict locator, `getByRole('main').getByRole('alert')`
   * (apps/e2e/pages/console.ts), as `acceptHostAlert` here and as `refusalAlert`
   * for D1, and a locator that matches twice fails.
   *
   * The pressure is different now and the rule is not. The host refusal that
   * used to sit here has become a `note` — no daemon is a disabled button with
   * something to read, not a refusal — so the running job is the only alert
   * left. That is what this pins: the count, and that the surviving one is D1's.
   */
  it('answers with one alert, not two, when a job is running as well', async () => {
    await openAcceptTab({ ...CASE, current: { running: true, job: RUNNING } });

    const alerts = await screen.findAllByRole('alert');

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain(JOB_RUNNING);
  });

  // The reading comes first: on the machine a report is actually read — which
  // is never the pinned image — a host-first gate would be the only answer this
  // panel ever gave, and it would never once ask for the pass it exists to
  // collect. The host is still refused, one question later.
  it('asks for the reading before it names the host', async () => {
    localStorage.clear();

    await openAcceptTab(CASE);

    const [start] = startButtons('accept');
    expect(start).toHaveProperty('disabled', true);
    expect(screen.getByRole('note', { name: 'accept gate' }).textContent).toMatch(
      /unreviewed/,
    );
  });
});

describe('the accept gate on a report with an accessibility failure', () => {
  const FAILING: ReportListEntry = {
    ...REPORT,
    counts: { ...REPORT.counts, changed: 5, a11y: 1 },
  };

  it('refuses it outright, whatever the host is', async () => {
    await openAcceptTab({ reports: [FAILING] });

    expect(startButtons('accept')).toHaveLength(0);
  });

  it('says which bucket did it', async () => {
    await openAcceptTab({ reports: [FAILING] });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/accessibility/i);
  });
});

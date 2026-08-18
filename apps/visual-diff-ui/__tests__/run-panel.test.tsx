// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentJobProvider } from '../components/CurrentJob';
import { REMOTE_REFUSAL, RUNNING_REFUSAL, RunPanel } from '../components/RunPanel';
import type { ReportListEntry } from '../lib/data';
import type { HistoryRecord } from '../lib/jobs';
import { JOB_RUNNING, NOT_LOCAL } from '../lib/refusals';
import { reviewStorageKey } from '../lib/review-state';
import { refreshCalls, setSearchParams } from './stubs/next-navigation';

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

interface ApiStub {
  /** What `GET /api/env` says this runner is. */
  image?: string | null;
  /** What `GET /api/jobs/current` says is happening. */
  current?: { running: boolean; job: HistoryRecord | null };
  /** What `POST /api/jobs` answers. */
  jobs?: { ok?: boolean; status?: number; body?: unknown };
}

const answered = (ok: boolean, status: number, body: unknown) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) }) as never;

/** The three endpoints this panel talks to, answered per case. An unstubbed URL
 *  throws rather than resolving: a screen quietly reading something this suite
 *  never arranged is exactly what the fingerprint seam must not do. */
function stubApi({ image = HOST.image, current, jobs }: ApiStub = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url === '/api/env') {
      return answered(true, 200, {
        platform: 'linux',
        arch: 'x64',
        image,
        playwright: null,
      });
    }
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
});

const tab = (name: string) => screen.getByRole('tab', { name });

const selectTab = (name: string) => fireEvent.click(tab(name));

const startButtons = (mode: string) =>
  screen.queryAllByRole('button', { name: `start ${mode}` });

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
  it('offers exactly the four modes the runner has', () => {
    renderPanel();

    const tabs = screen.getAllByRole('tab');

    expect(tabs.map((mode) => mode.textContent)).toEqual([
      'capture',
      'compare',
      'run',
      'accept',
    ]);
  });

  it('opens on capture', () => {
    renderPanel();

    expect(tab('capture').getAttribute('aria-selected')).toBe('true');
  });

  it('moves the selection to the tab that was clicked', () => {
    renderPanel();

    selectTab('run');

    expect(tab('run').getAttribute('aria-selected')).toBe('true');
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

    selectTab('run');

    expect(startButtons('run')).toHaveLength(1);
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

  // `--filter` is the CLI's own flag, and the only one of the three the composed
  // `check` takes: an empty box must not become a filter matching nothing.
  it('carries the story filter only when one was typed', async () => {
    const fetchMock = renderPanel();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'main-2026-08-17' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: '--filter' }), {
      target: { value: 'atoms-button' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'start capture' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jobs',
        expect.objectContaining({
          body: JSON.stringify({
            mode: 'capture',
            label: 'main-2026-08-17',
            filter: 'atoms-button',
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
 * `check` guards its own host before it takes a shot, so on a developer's own
 * machine a start button here has exactly one outcome: a job that exits 2 a
 * moment later, reported as a failure. The tab says so up front instead, and
 * hands over the command that works — the treatment the accept tab already had.
 */
describe('capture on a host that is not the pinned container', () => {
  it.each(['capture', 'run'])('offers no start button on the %s tab', async (mode) => {
    renderPanel({ image: null });
    selectTab(mode);

    await waitFor(() =>
      expect(screen.getByRole('note', { name: 'container required' })).toBeDefined(),
    );
    expect(startButtons(mode)).toHaveLength(0);
  });

  it('hands over the container command instead', async () => {
    renderPanel({ image: 'ubuntu:24.04' });

    const command = await screen.findByTestId('check-docker-command');

    expect(command.textContent).toContain('node packages/visual-diff/src/cli.mjs check');
    // Not the accept testid: the e2e accept scenario finds its command by that
    // name, and two blocks answering to it would be one trap deeper.
    expect(screen.queryByTestId('accept-docker-command')).toBeNull();
  });

  it('names what this runner is and what the baselines need', async () => {
    renderPanel({ image: 'ubuntu:24.04' });

    const note = await screen.findByRole('note', { name: 'container required' });

    expect(note.textContent).toContain('ubuntu:24.04');
    expect(note.textContent).toContain(HOST.image);
  });

  // Capture is the tab the panel opens on, so an alert here would be a second
  // `role="alert"` inside the console's `main` on every page load — which is
  // what the e2e page object's refusal lookup cannot survive.
  it('is a note, so it does not become a second alert on the page', async () => {
    renderPanel({ image: null });

    await screen.findByRole('note', { name: 'container required' });

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  // compare moves no pixels — it reads two shot trees off disk — so the host it
  // runs on is not a question, and the button stays.
  it('leaves compare alone', async () => {
    renderPanel({ image: null });
    selectTab('compare');

    await waitFor(() => expect(startButtons('compare')).toHaveLength(1));
  });

  // Sample mode is the nearer answer: an instance serving the committed fixtures
  // has no runner to be on the wrong host, and its own note already says what
  // would change that. The e2e sample world asserts a DISABLED button here.
  it('leaves sample mode saying what sample mode says', async () => {
    renderPanel({ isSample: true, image: null });

    await waitFor(() => expect(startButtons('capture')).toHaveLength(1));
    expect(screen.getByRole('note', { name: 'sample mode' })).toBeDefined();
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
  const CASE: PanelCase = { image: null };

  /** The host is the LAST question the gate asks, so every case below is a
   *  report that has already been read through. An unreviewed one is held at
   *  the review gate instead — the answer a reviewer can still act on. */
  beforeEach(() => {
    localStorage.setItem(
      reviewStorageKey(REPORT.id),
      JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f']),
    );
  });

  it('offers no run button at all — the mismatch is a refusal, not a disabled control', async () => {
    await openAcceptTab(CASE);

    expect(startButtons('accept')).toHaveLength(0);
  });

  it('warns in the words the decision is written in', async () => {
    await openAcceptTab(CASE);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('bare-metal accept');
  });

  it('degrades to the container command, copyable', async () => {
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

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';
import type { JobMode } from '../../pages/console';

const { Given, When, Then } = createBdd(test);

/** The four modes the runner has, in the order the tablist draws them. */
const JOB_MODES: readonly JobMode[] = ['capture', 'compare', 'run', 'accept'];

/** The committed corpus's reserved label. It is offered to the pickers and is
 *  never one of the captured sets — `lib/baselines.ts` and the refusal in
 *  `DELETE /api/sets/baselines` are the two halves of that rule. */
const CANONICAL_LABEL = 'baselines';

/**
 * What the outcome word promises about the exit code beside it.
 *
 * `lib/outcome.ts` derives the word from the code and never stores it, so this
 * table is the same claim read back off the page: a row whose word and code
 * disagree means the derivation broke, and no seed fact is needed to see it.
 */
const OUTCOME_EXIT: Record<string, (exit: string) => boolean> = {
  succeeded: (exit) => exit === '0',
  'succeeded (diffs)': (exit) => exit === '1',
  failed: (exit) => Number(exit) >= 2,
  // A job whose process vanished keeps its nulls; the cell renders empty.
  interrupted: (exit) => exit.trim() === '',
  // The lock is the only thing that can say this, and it says nothing about an
  // exit code because there is not one yet.
  running: (exit) => exit.trim() === '',
};

Given('this console is serving my own captures', async ({ console: vd }) => {
  await vd.openHere();
  // The precondition is asserted, never skipped. A machine with nothing
  // captured has a data directory — `pnpm dev` creates one — and no sets in it,
  // and a lane that quietly passed there would assert nothing on exactly the
  // machine it is least able to vouch for.
  await expect(
    vd.setRows,
    'This lane reads YOUR captures, and this console lists none. Capture a set first — ' +
      'start a capture from the console, or run `pnpm visual-diff:container capture`.',
  ).not.toHaveCount(0);
});

When('I visit my console', async ({ page, console: vd, localState }) => {
  await vd.openHere();
  await expect(vd.setsTable).toBeVisible();
  // How deep the history was on arrival. "No job has been started" is a claim
  // about a change, and this is the reading it is compared against — a console
  // that has run jobs before shows the last one in the current-job region
  // forever, so the region's contents alone say nothing about this scenario.
  localState.historyDepth = await vd.historyRows
    .filter({ has: page.getByRole('cell') })
    .count();
});

Then('the console is not badged as sample data', async ({ console: vd }) => {
  // Positive anchor first: the badge's absence is also how a dead page looks.
  await expect(vd.setsTable).toBeVisible();
  await expect(vd.sampleBadge).toHaveCount(0);
});

Then('at least one snapshot set is listed', async ({ console: vd }) => {
  await expect(vd.setRows.first()).toBeVisible();
});

Then(
  'every listed set carries a label, a branch, a date and a story count',
  async ({ console: vd }) => {
    // `.all()` reads the DOM as it stands and never waits, so the table has to
    // be there before the rows are collected.
    await expect(vd.setRows.first()).toBeVisible();
    const rows = await vd.setRows.all();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      for (const column of ['label', 'branch', 'date']) {
        await expect(vd.setCell(row, column)).not.toBeEmpty();
      }
      // A count, not just ink: the column is what the panel's own `(n)` is a sum
      // of, so a dash here would be a set the console cannot describe.
      // The figure leads; a visually-hidden " stories" rides behind it so a
      // reader of the sub-768px card layout hears what the number counts.
      await expect(vd.setCell(row, 'stories')).toHaveText(/^\d+\b/);
      // Size is measured on disk rather than recorded, so a registry row with no
      // shot tree legitimately shows a dash — but it must still say something.
      await expect(vd.setCell(row, 'size')).not.toBeEmpty();
    }
  },
);

Then(
  'the canonical corpus is badged canonical and cannot be deleted',
  async ({ console: vd }) => {
    const corpus = vd.canonicalCorpus;
    await expect(corpus).toBeVisible();
    await expect(corpus.getByText(CANONICAL_LABEL, { exact: true })).toBeVisible();
    await expect(corpus.getByText('canonical', { exact: true })).toBeVisible();
    // Present and disabled, not absent: every captured set below carries the
    // button, so a corpus without one would read as an omission, not as a rule.
    await expect(corpus.getByRole('button', { name: 'delete' })).toBeDisabled();
  },
);

Then('the canonical corpus is not one of the listed sets', async ({ console: vd }) => {
  // The panel's `(n)` counts captures. A corpus counted among them would make
  // that number mean two things at once.
  await expect(vd.setRow(CANONICAL_LABEL)).toHaveCount(0);
});

Then('both pickers offer every listed set', async ({ console: vd, localState }) => {
  await expect(vd.setRows.first()).toBeVisible();
  const listed = (await vd.setLabel(vd.setRows).allInnerTexts())
    .map((label) => label.trim())
    .filter(Boolean);
  expect(listed.length).toBeGreaterThan(0);
  localState.setLabels = listed;

  for (const picker of [vd.pickerA, vd.pickerB]) {
    const offered = (await vd.pickerOptions(picker).allInnerTexts()).map((o) => o.trim());
    for (const label of listed) expect(offered).toContain(label);
    // The corpus is a comparison target that is not a capture — the one entry
    // the pickers carry and the table does not.
    expect(offered).toContain(CANONICAL_LABEL);
  }
});

Then('the two pickers open on different sets', async ({ console: vd }) => {
  const a = await vd.selectedOption(vd.pickerA).innerText();
  const b = await vd.selectedOption(vd.pickerB).innerText();
  // Newest against second-newest: a comparison of a set with itself is the one
  // pairing that can say nothing, so it is not what the console offers first.
  expect(a.trim()).not.toBe(b.trim());
});

When('I choose the two newest sets to compare', async ({ console: vd, localState }) => {
  localState.chosen = {
    a: (await vd.selectedOption(vd.pickerA).innerText()).trim(),
    b: (await vd.selectedOption(vd.pickerB).innerText()).trim(),
  };
  await vd.compareButton.click();
});

Then(
  'the job form is set to compare those two sets',
  async ({ page, console: vd, localState }) => {
    const chosen = localState.chosen;
    expect(chosen, 'no compare step ran before this assertion').toBeDefined();
    if (!chosen) return;

    // The pre-fill travels through the URL, which is what makes it shareable —
    // and what a deep link into the console has to restore.
    await expect(page).toHaveURL(/[?&]mode=compare(&|$)/);
    await expect(vd.runField('baseline')).toHaveValue(chosen.a);
    await expect(vd.runField('candidate')).toHaveValue(chosen.b);
  },
);

Then('no job has been started', async ({ page, console: vd, localState }) => {
  // Nothing is RUNNING: a live job replaces the start control with an alert
  // inside `main`, which is exactly what `refusalAlert` counts.
  await expect(vd.refusalAlert).toHaveCount(0);

  // And nothing RAN: the history is a row per job, so its depth is the reading
  // that would move. The current-job region is not — it keeps showing the last
  // finished job for as long as there is one, which on a console that has run
  // anything at all is forever.
  const depth = localState.historyDepth;
  expect(depth, 'no arrival step recorded the history depth').toBeDefined();
  if (depth === undefined) return;

  await expect(vd.historyRows.filter({ has: page.getByRole('cell') })).toHaveCount(depth);
});

Then(
  'each of the four job modes offers its own start button',
  async ({ page, console: vd }) => {
    for (const mode of JOB_MODES) {
      await vd.selectJobMode(mode);
      await expect(vd.jobTab(mode)).toHaveAttribute('aria-selected', 'true');
      // Named per mode rather than a bare "start": the button says what it will
      // do, and this is the assertion that keeps it saying it.
      await expect(page.getByRole('button', { name: `start ${mode}` })).toHaveCount(1);
    }
  },
);

Then(
  "every past run's outcome word matches its exit code",
  async ({ page, console: vd }) => {
    const rows = await vd.historyRows.filter({ has: page.getByRole('cell') }).all();
    expect(
      rows.length,
      'This console has run nothing, so there is no history to check. Run a compare first.',
    ).toBeGreaterThan(0);

    for (const row of rows) {
      const word = (await vd.historyCell(row, 'status').innerText()).trim();
      const exit = await vd.historyCell(row, 'exit').innerText();
      const rule = OUTCOME_EXIT[word];

      expect(
        rule,
        `history row says "${word}", which is not one of the outcome words`,
      ).toBeDefined();
      if (!rule) continue;

      expect(
        rule(exit),
        `outcome "${word}" does not agree with exit "${exit.trim()}"`,
      ).toBe(true);
    }
  },
);

Then('every listed report links to its own page', async ({ page, console: vd }) => {
  const rows = await vd.reportRows.filter({ has: page.getByRole('cell') }).all();
  expect(
    rows.length,
    'This console holds no reports. Compare two capture sets first.',
  ).toBeGreaterThan(0);

  for (const row of rows) {
    const link = vd.reportLink(row).first();
    const id = (await link.innerText()).trim();
    // The link's text IS the id, so the href is derivable from what the reader
    // can see — no seed fact needed to know where the row should go.
    await expect(link).toHaveAttribute('href', `/report/${id}`);
  }
});

import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

import { test } from './fixtures';

const { When, Then } = createBdd(test);

// Sample mode is the empty-data default — the same app booted with no seeded
// tree (the deployed instance's natural state), reached on its own world
// (the third webServer entry, port 3201).

When('I visit the sample console', async ({ console: consolePage }) => {
  await consolePage.open('sample');
});

When('I open the sample report', async ({ console: consolePage }) => {
  await consolePage.sampleReportLink.click();
});

Then('the sample badge is visible', async ({ console: consolePage }) => {
  await expect(consolePage.sampleBadge).toBeVisible();
});

Then(
  'starting a job is disabled with an explanation',
  async ({ console: consolePage }) => {
    await expect(consolePage.startButton).toBeDisabled();
    // Disabled rather than absent, and the note names the way out: this world is
    // served from localhost like the other two, so what stops it is the empty
    // data directory and not the machine it is on.
    await expect(consolePage.sampleModeNote).toContainText(/VISUAL_DIFF_DATA_DIR/);
  },
);

Then(
  'nothing on the console offers to delete or prune',
  async ({ console: consolePage }) => {
    // Absent, where the start control one panel over is merely disabled. The two
    // are not inconsistent: a start control explains itself — the sample note
    // names the way out — where a red delete that can only ever refuse reads, from
    // the reviewer's side, as a delete that silently failed.
    //
    // This world is served from localhost like the other two, so `isLocal` is
    // true and the empty data directory is the whole of what takes these off the
    // page. That is the half of the rule the tables did not keep until they were
    // given `frozen` rather than `isLocal`, and it is why this scenario is worth
    // a requirement rather than a unit test alone: the fixtures are this repo's
    // own files, and a console that offered to delete them would be offering to
    // delete the thing the suite reads.
    //
    // The rows are asserted present FIRST, so a count of zero cannot pass by the
    // tables simply being empty.
    await expect(consolePage.setRows).not.toHaveCount(0);
    await expect(consolePage.reportRows).not.toHaveCount(0);

    await expect(consolePage.rowDeletes).toHaveCount(0);
    await expect(consolePage.pruneButton).toHaveCount(0);
    await expect(consolePage.keepLatest).toHaveCount(0);
  },
);

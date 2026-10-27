import { Stack } from '@gate/ui';
import {
  DashboardTemplate,
  type DashboardTemplateProps,
} from '@/components/DashboardTemplate';
import type { ReportListEntry } from '@/lib/data';
import sets from '../../fixtures/sets.json';
import baselinesVsAug24 from '../../fixtures/reports/baselines__main-2026-08-24/summary.json';
import aug17VsAug13 from '../../fixtures/reports/main-2026-08-17__main-2026-08-13/summary.json';
import sep17VsOct13 from '../../fixtures/reports/main-2026-09-17__main-2026-10-13/summary.json';
import oct13VsSep17 from '../../fixtures/reports/main-2026-10-13__main-2026-09-17/summary.json';
import { inConsole } from './console';

/**
 * `/` as a deployment serving `fixtures/` draws it: the committed sample sets and
 * reports, no history, no corpus card, and a run panel with nothing to start.
 * Baselined, as a screen is, at both viewports.
 *
 * Read from the same files the sample instance reads, so a fixture edit moves
 * this baseline as it moves the page. The one number the page measures rather
 * than reads is written down here: the bytes of the one set directory
 * `fixtures/sets/` holds. The corpus card stays off, as it is on a deployment
 * with no checkout; counted here, it would move this baseline on every accept.
 */
const meta = {
  title: 'Screens/Console/Dashboard',
  component: DashboardTemplate,
};

export default meta;

/** Newest id first, as `listReportIds` (lib/data.ts) sorts them. */
const reports: ReportListEntry[] = Object.entries({
  'main-2026-10-13__main-2026-09-17': oct13VsSep17,
  'main-2026-09-17__main-2026-10-13': sep17VsOct13,
  'main-2026-08-17__main-2026-08-13': aug17VsAug13,
  'baselines__main-2026-08-24': baselinesVsAug24,
})
  .map(([id, summary]) => ({ id, exitCode: summary.exitCode, counts: summary.counts }))
  .sort((left, right) => (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));

export const Sample = {
  args: {
    sets: sets.sets,
    sizes: { 'main-2026-08-30': 216_626 },
    reports,
    history: [],
    isSample: true,
    isLocal: false,
    corpus: null,
    runningId: null,
  } satisfies DashboardTemplateProps,
  render: (args: DashboardTemplateProps) => (
    <Stack gap={6}>
      <DashboardTemplate {...args} />
    </Stack>
  ),
  ...inConsole('/'),
};

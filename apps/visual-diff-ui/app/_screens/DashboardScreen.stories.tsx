import { Stack } from '@gate/ui';
import {
  DashboardTemplate,
  type DashboardTemplateProps,
} from '@/components/DashboardTemplate';
import { inConsole } from './console';
import { SAMPLE_REPORTS, SAMPLE_SETS, SAMPLE_SIZES } from './dashboard-sample';

/**
 * `/` as a deployment serving `fixtures/` draws it: the committed sample sets and
 * reports, no history, no corpus card, and a run panel with nothing to start.
 * Baselined, as a screen is, at both viewports.
 *
 * Read from the same files the sample instance reads (`dashboard-sample.ts`), so
 * a fixture edit moves this baseline as it moves the page. The corpus card stays
 * off, as it is on a deployment with no checkout; counted here, it would move
 * this baseline on every accept.
 */
const meta = {
  title: 'Screens/Visual-diff-ui/Dashboard',
  component: DashboardTemplate,
};

export default meta;

export const Sample = {
  args: {
    sets: SAMPLE_SETS,
    sizes: SAMPLE_SIZES,
    reports: SAMPLE_REPORTS,
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

import { Stack } from '@gate/ui';
import { ComparisonRoute, type ComparisonRouteProps } from '@/components/ComparisonRoute';
import { ReportTemplate } from '@/components/ReportTemplate';
import { reportSides } from '@/lib/report-view';
import { SAMPLE_HOMES } from './board-sample';
import { inConsole } from './console';
import { SAMPLE_SETS } from './dashboard-sample';
import {
  SAMPLE_COMPARISON_PATH,
  SAMPLE_LEDGER,
  SAMPLE_REPORT,
  SAMPLE_REPORT_ID,
  SAMPLE_VARIANTS,
} from './report-sample';

/**
 * `/report/[id]/compare/[key]` opened from its report: the comparison modal over
 * the report it came from (`app/report/[id]/layout.tsx` draws both), on a
 * changed dialog with readings, in the mode a bare link opens in. Baselined, as
 * a screen is, at both viewports.
 */
const meta = {
  title: 'Screens/Visual-diff-ui/Comparison',
  component: ComparisonRoute,
};

export default meta;

export const Sample = {
  args: {
    reportId: SAMPLE_REPORT_ID,
    variants: SAMPLE_VARIANTS,
    sides: reportSides(SAMPLE_REPORT_ID),
    ledger: SAMPLE_LEDGER,
    homes: SAMPLE_HOMES,
    entry: 'report',
  } satisfies ComparisonRouteProps,
  render: (args: ComparisonRouteProps) => (
    <>
      <Stack gap={6}>
        <ReportTemplate
          id={SAMPLE_REPORT_ID}
          report={SAMPLE_REPORT}
          sets={SAMPLE_SETS}
          corpus={null}
          frozen
        />
      </Stack>
      <ComparisonRoute {...args} />
    </>
  ),
  ...inConsole(SAMPLE_COMPARISON_PATH, { overModal: true }),
};

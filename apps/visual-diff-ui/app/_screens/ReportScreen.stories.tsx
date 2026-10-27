import { Stack } from '@gate/ui';
import { ReportTemplate, type ReportTemplateProps } from '@/components/ReportTemplate';
import { inConsole } from './console';
import { SAMPLE_SETS } from './dashboard-sample';
import { SAMPLE_REPORT, SAMPLE_REPORT_ID, SAMPLE_REPORT_PATH } from './report-sample';

/**
 * `/report/[id]` as a deployment serving `fixtures/` draws it, for the report
 * that both changed and lost variants: frozen, so no delete, and no corpus to
 * name a `baselines` side by. Baselined, as a screen is, at both viewports.
 *
 * One story per bucket the report holds, each the address its bucket chip
 * writes (`?bucket=`). Unfiltered, the page is every card at once, and its
 * screenshot was past the corpus's per-file budget at either viewport.
 */
const meta = {
  title: 'Screens/Visual-diff-ui/Report',
  component: ReportTemplate,
};

export default meta;

const args = {
  id: SAMPLE_REPORT_ID,
  report: SAMPLE_REPORT,
  sets: SAMPLE_SETS,
  corpus: null,
  frozen: true,
} satisfies ReportTemplateProps;

// The page's own wrapper (app/report/[id]/page.tsx).
const render = (props: ReportTemplateProps) => (
  <Stack gap={6}>
    <ReportTemplate {...props} />
  </Stack>
);

export const Changed = {
  args,
  render,
  ...inConsole(SAMPLE_REPORT_PATH, { query: { bucket: 'changed' } }),
};

export const Removed = {
  args,
  render,
  ...inConsole(SAMPLE_REPORT_PATH, { query: { bucket: 'removed' } }),
};

import { Stack } from '@gate/ui';
import { SetTemplate, type SetTemplateProps } from '@/components/SetTemplate';
import { inConsole } from './console';
import { SAMPLE_SETS } from './dashboard-sample';
import { SAMPLE_SET_LABEL, SAMPLE_SET_PATH, SAMPLE_SET_SHOTS } from './set-sample';

/**
 * `/set/[label]` as a deployment serving `fixtures/` draws it, for the one sample
 * set that ships its shots, unfiltered. A capture set, so no corpus card.
 * Baselined, as a screen is, at both viewports.
 */
const meta = {
  title: 'Screens/Visual-diff-ui/Set',
  component: SetTemplate,
};

export default meta;

export const Sample = {
  args: {
    shots: SAMPLE_SET_SHOTS,
    corpus: null,
    set: SAMPLE_SETS.find((entry) => entry.label === SAMPLE_SET_LABEL) ?? null,
  } satisfies SetTemplateProps,
  // The page's own wrapper (app/set/[label]/page.tsx).
  render: (args: SetTemplateProps) => (
    <Stack gap={6}>
      <SetTemplate {...args} />
    </Stack>
  ),
  ...inConsole(SAMPLE_SET_PATH),
};

import { Stack } from '@gate/ui';
import { SetTemplate } from '@/components/SetTemplate';
import { ShotView, type ShotViewProps } from '@/components/ShotView';
import { SAMPLE_HOMES } from './board-sample';
import { inConsole } from './console';
import { SAMPLE_SETS } from './dashboard-sample';
import {
  SAMPLE_SET_LABEL,
  SAMPLE_SET_SHOTS,
  SAMPLE_SHOT,
  SAMPLE_SHOT_PATH,
  SAMPLE_SHOT_READINGS,
} from './set-sample';

/**
 * `/set/[label]/shot/[key]` opened from its set: the shot view as a modal over
 * the set viewer (`app/set/[label]/layout.tsx` draws both), on a shot with
 * readings, beside its tile on the board. Baselined, as a screen is, at both
 * viewports.
 */
const meta = {
  title: 'Screens/Visual-diff-ui/Shot',
  component: ShotView,
};

export default meta;

export const Sample = {
  args: {
    ...SAMPLE_SHOT,
    ledger: SAMPLE_SHOT_READINGS,
    homes: SAMPLE_HOMES,
    entry: 'set',
  } satisfies ShotViewProps,
  render: (args: ShotViewProps) => (
    <>
      <Stack gap={6}>
        <SetTemplate
          shots={SAMPLE_SET_SHOTS}
          corpus={null}
          set={SAMPLE_SETS.find((entry) => entry.label === SAMPLE_SET_LABEL) ?? null}
        />
      </Stack>
      <ShotView {...args} />
    </>
  ),
  ...inConsole(SAMPLE_SHOT_PATH, { overModal: true }),
};

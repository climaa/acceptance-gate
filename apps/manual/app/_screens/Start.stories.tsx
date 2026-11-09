import { StartScreen } from '@/components/StartScreen';
import { TOUR_SLUG } from '@/lib/allowlist';
import { inManual } from './frame';

/** `/start`: the on-boarding tour, each step anchored on the published scenario it
 *  names. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Manual/Start',
  component: StartScreen,
  parameters: { screen: { routes: ['/start'] } },
};

export default meta;

export const Default = {
  ...inManual(`/${TOUR_SLUG}`),
};

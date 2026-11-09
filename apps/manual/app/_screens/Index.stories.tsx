import { IndexScreen } from '@/components/IndexScreen';
import { inManual } from './frame';

/** `/`: the manual's front door, its start card and one card per published page,
 *  with the published features' real scenario counts. Baselined, as a screen is,
 *  at both viewports. */
const meta = {
  title: 'Screens/Manual/Index',
  component: IndexScreen,
  parameters: { screen: { routes: ['/'] } },
};

export default meta;

export const Default = {
  ...inManual('/'),
};

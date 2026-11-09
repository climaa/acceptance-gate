import { AboutScreen } from '@/components/AboutScreen';
import { inBlog } from './frame';

/** `/about`, the authorship page. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Blog/About',
  component: AboutScreen,
  parameters: { screen: { routes: ['/about'] } },
};

export default meta;

export const Default = {
  ...inBlog('/about'),
};

import NotFound from '../not-found';
import { inBlog } from './frame';

/** The page an address no route answers gets (`app/not-found.tsx`). No route of
 *  its own to cover. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Blog/NotFound',
  component: NotFound,
  parameters: { screen: { routes: [] } },
};

export default meta;

export const Default = {
  ...inBlog('/no-such-page'),
};

import { HomeScreen } from '@/components/HomeScreen';
import { SAMPLE_POSTS } from './blog-sample';
import { inBlog } from './frame';

/** `/`: the hero and the four latest posts. Baselined, as a screen is, at both
 *  viewports. */
const meta = {
  title: 'Screens/Blog/Home',
  component: HomeScreen,
  parameters: { screen: { routes: ['/'] } },
};

export default meta;

export const Latest = {
  args: { posts: SAMPLE_POSTS.slice(0, 4) },
  ...inBlog('/'),
};

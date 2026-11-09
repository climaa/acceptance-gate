import { BlogIndexScreen } from '@/components/BlogIndexScreen';
import { SAMPLE_POSTS } from './blog-sample';
import { inBlog } from './frame';

/** `/blog` and its later pages, `/blog/page/[n]`: one page of the index with its
 *  pagination. Baselined, as a screen is, at both viewports. */
const meta = {
  title: 'Screens/Blog/Index',
  component: BlogIndexScreen,
  parameters: { screen: { routes: ['/blog', '/blog/page/[n]'] } },
};

export default meta;

export const FirstPage = {
  args: { posts: SAMPLE_POSTS, page: 1 },
  ...inBlog('/blog'),
};

export const LaterPage = {
  args: { posts: SAMPLE_POSTS, page: 2 },
  ...inBlog('/blog/page/2'),
};

import { TagScreen } from '@/components/TagScreen';
import { tagPath } from '@/lib/post-paths';
import { SAMPLE_TAG, SAMPLE_TAGGED_POSTS } from './blog-sample';
import { inBlog } from './frame';

/** `/tags/[tag]`: every post carrying one tag. Baselined, as a screen is, at both
 *  viewports. */
const meta = {
  title: 'Screens/Blog/Tag',
  component: TagScreen,
  parameters: { screen: { routes: ['/tags/[tag]'] } },
};

export default meta;

export const Tagged = {
  args: { label: SAMPLE_TAG, posts: SAMPLE_TAGGED_POSTS },
  ...inBlog(tagPath(SAMPLE_TAG)),
};

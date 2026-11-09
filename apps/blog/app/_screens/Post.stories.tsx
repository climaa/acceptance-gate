import { PostScreen } from '@/components/PostScreen';
import { SAMPLE_ARTICLE } from './blog-sample';
import { inBlog } from './frame';

/**
 * `/blog/[slug]`: one article. The route compiles its MDX on the server, so the
 * body here is the elements that pipeline produces — headings, paragraphs, a
 * list, inline code and a code block — written out, and short enough to keep the
 * screenshot under the per-file budget at mobile. Baselined, as a screen is, at
 * both viewports.
 */
const meta = {
  title: 'Screens/Blog/Post',
  component: PostScreen,
  parameters: { screen: { routes: ['/blog/[slug]'] } },
};

export default meta;

export const Article = {
  args: {
    post: SAMPLE_ARTICLE,
    children: (
      <>
        <p>
          A pixel diff answers one question: did anything move? When part of the code is
          written by an agent, that question stops being enough. The agent moves things on
          purpose, often, and in places nobody was looking.
        </p>
        <h2>What the diff cannot tell you</h2>
        <p>
          A changed screenshot is a fact, not a verdict. The review that follows has to
          say whether the change was intended, and that needs the design the screenshot is
          judged against.
        </p>
        <ul>
          <li>Which story moved, at which viewport and theme.</li>
          <li>The tile on the board that story should match.</li>
          <li>
            The spacing it measured, named by the <code>--space-*</code> token it is
            nearest to.
          </li>
        </ul>
        <pre>
          <code>{'pnpm visual-diff --filter atoms\npnpm visual-diff:accept'}</code>
        </pre>
        <p>The rest of the post walks through each of those, in that order.</p>
      </>
    ),
  },
  ...inBlog(`/blog/${SAMPLE_ARTICLE.slug}`),
};

// @vitest-environment node
//
// A file of its own because the environment is a per-file decision, and this is
// the one case in the component's contract that jsdom cannot pose: a renderer
// with no `document` at all. Everything else about the dialog is asserted next
// to it in Dialog.test.tsx.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Dialog } from './Dialog';

/**
 * The dialog portals into `document.body`, and `react-dom/server` has neither a
 * `document` nor a portal to put in it — rendering one there throws outright.
 *
 * That is reachable rather than hypothetical: `apps/visual-diff-ui` restores an
 * open comparison modal from the URL, so a shared report link asks the server to
 * render a dialog whose `open` is already true. The surface arrives on
 * hydration instead, which is safe precisely because a portal contributes
 * nothing to the tree it is written in — there is no host node here for the
 * server's HTML to disagree with.
 */
describe('server rendering', () => {
  it('renders an open dialog to nothing rather than throwing', () => {
    const html = renderToString(
      <Dialog open onClose={() => {}} label="Comparison">
        <button type="button">Keep</button>
      </Dialog>,
    );

    expect(html).toBe('');
  });
});

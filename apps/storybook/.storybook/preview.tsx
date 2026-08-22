// Every literal below is imported: the toolbar and the capture matrix are the same
// numbers, named once in policy. The bug this shape forbids is a quiet one — name
// the global `theme` here while the capture URL sets `colorScheme` and every dark
// shot renders light, landing as baselines that differ from nothing forever.
//
// Policy is a JSDoc-typed `.mjs` — it is loaded by ESLint and by the capture CLI as
// well as through Vite here — which is what `allowJs` in this app's tsconfig is for.
import {
  CAPTURE_TARGET,
  COLOR_SCHEME_GLOBAL,
  THEMES,
  VIEWPORTS,
} from '@gate/visual-diff/policy';
import type { Decorator, Preview } from '@storybook/nextjs-vite';

// The design system's tokens, faces and component rules — the same stylesheet the
// blog's root layout imports, so a story is rendered by the shipping CSS rather
// than by a copy of it. Imported here and nowhere else in this app.
import '@gate/ui/styles.css';

import { applyColorScheme, UNSET_THEME } from './color-scheme';
import { ThemedDocsContainer } from './ThemedDocsContainer';

/** `data-theme` on `<html>`, never the OS colour-scheme media query: a media query
 *  cannot be set from a capture URL, so a differ driving it would be blind to one
 *  whole half of the matrix. Only reaches stories — see ThemedDocsContainer for why
 *  a pure-MDX docs page needs its own hook into the same global. */
const withColorScheme: Decorator = (Story, { globals }) => {
  applyColorScheme(globals[COLOR_SCHEME_GLOBAL] ?? UNSET_THEME);

  return Story();
};

/** The differ shoots this element, so whatever the canvas puts around a story —
 *  padding, a layout of its own — is inside every baseline. Left as Storybook styles
 *  it, a component that grows shifts the pixels below it and churns baselines for
 *  stories that did not change. */
const withFlatRoot: Decorator = (Story) => {
  // Absent on a docs page, and on the first render before the canvas has mounted.
  const root = document.querySelector<HTMLElement>(CAPTURE_TARGET);

  if (root) {
    root.style.display = 'block';
    root.style.padding = '0';
  }

  return Story();
};

/** One toolbar entry per captured viewport, keyed by the policy name, so a viewport
 *  added there shows up here with no second edit. No initial value: the differ sizes
 *  its own browser, and pinning one would letterbox every story for a reader who
 *  only wanted to browse. */
const viewportOptions = Object.fromEntries(
  Object.entries(VIEWPORTS).map(([name, { width, height }]) => [
    name,
    { name, styles: { width: `${width}px`, height: `${height}px` } },
  ]),
);

const preview: Preview = {
  // Every story gets a generated docs page — project-wide, so adding a
  // component never means also remembering to tag its story. Nothing in
  // packages/ui carries this tag itself.
  tags: ['autodocs'],
  // A global rather than a parameter: only a global can be set from the capture URL,
  // which is what keeps the differ thin.
  globalTypes: {
    [COLOR_SCHEME_GLOBAL]: {
      description: 'Theme the story renders in',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [...THEMES],
        // Reads the theme on screen back into the toolbar: the one thing a reader
        // has to be able to check by eye is which half of the matrix they are
        // looking at.
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { [COLOR_SCHEME_GLOBAL]: UNSET_THEME },
  parameters: {
    // Every Docs page under src/docs is pure MDX with no <Story>/<Canvas> embed, so
    // withColorScheme above never runs for one — this is the other half of the fix.
    docs: { container: ThemedDocsContainer },
    viewport: { options: viewportOptions },
    // Default is alphabetical, which puts Docs last (after Templates) and
    // Diff Policy first within it — neither is the order a reader should
    // meet the sidebar in. Welcome is written as the front door: it's the one
    // page that explains what the rest of the sidebar is. This only fixes the
    // sidebar's own order, though — Storybook's manager only ever
    // auto-selects a `type: "story"` entry when nothing is chosen yet
    // (confirmed by reading manager-api's selectFirstStory(), which filters
    // on that type and never falls through to a docs-only page), so it
    // cannot land a bare visit on Docs by itself. What actually makes the
    // deployed root URL open on Welcome is the redirect in ../vercel.json —
    // which the blog's "Storybook" nav link (apps/blog/app/layout.tsx) also
    // routes through, since it points at the bare origin with no slug.
    options: {
      storySort: {
        order: [
          'Docs',
          [
            'Welcome',
            // Then the system itself, narrowest first: what it's made of, how
            // it's layered, how it's checked, how it ships.
            'System Design',
            // Overview before Tokens: it narrates the boards Tokens renders a
            // live slice of, and a page cannot share a name with its folder.
            ['Overview', 'Tokens'],
            'Atomic Design',
            ['Layering Rule'],
            'QA',
            // Diff Policy first: it defines the capture matrix that Visual
            // Diff Workflow then describes running. The acceptance suite sits
            // last — the top of the testing pyramid, read after the layers
            // beneath it.
            ['Diff Policy', 'Visual Diff Workflow', 'Acceptance Suite Locally'],
            // DevOps sits after the design-system pages and before Skills: it
            // describes what happens to a change after you have made one, so it
            // only makes sense once the reader knows what the change is to.
            'DevOps',
            // The Gate first: it explains what `gate` is, which Dependency
            // Bumps then assumes when it talks about a bump PR waiting on it.
            ['The Gate', 'Dependency Bumps'],
            'Skills',
            [
              'Overview',
              // Adoption first: the optimizer and the prefetching skill both
              // require the flag it sets, and Dev Loop is the one usable today.
              'Cache Components Adoption',
              'Cache Components Optimizer',
              'Partial Prefetching Adoption',
              'Dev Loop',
            ],
          ],
          'Atoms',
          'Molecules',
          'Organisms',
          'Templates',
        ],
      },
    },
  },
  decorators: [withColorScheme, withFlatRoot],
};

export default preview;

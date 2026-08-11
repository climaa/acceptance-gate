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

/** Light is the *absence* of `data-theme`: `tokens.css` has no `[data-theme='light']`
 *  block, so writing the attribute out for it would select nothing. The toolbar has
 *  to start on the theme an untouched root already renders, and every other theme in
 *  `THEMES` is written through as-is — the attribute value is the theme's name. */
const UNSET_THEME = 'light';

/** `data-theme` on `<html>`, never the OS colour-scheme media query: a media query
 *  cannot be set from a capture URL, so a differ driving it would be blind to one
 *  whole half of the matrix. */
const withColorScheme: Decorator = (Story, { globals }) => {
  const theme = globals[COLOR_SCHEME_GLOBAL] ?? UNSET_THEME;
  const root = document.documentElement;

  if (theme === UNSET_THEME) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }

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
    viewport: { options: viewportOptions },
    // Default is alphabetical, which puts Docs last (after Templates) and
    // Diff Policy first within it — neither is the order a reader should
    // meet the sidebar in. System Design is written as the front door: it's
    // the one page that explains what the rest of the sidebar is. This only
    // fixes the sidebar's own order, though — Storybook's manager only ever
    // auto-selects a `type: "story"` entry when nothing is chosen yet
    // (confirmed by reading manager-api's selectFirstStory(), which filters
    // on that type and never falls through to a docs-only page), so it
    // cannot land a bare visit on Docs by itself. What actually makes the
    // deployed root URL open on System Design is the redirect in
    // ../vercel.json.
    options: {
      storySort: {
        order: [
          'Docs',
          [
            'System Design',
            'Diff Policy',
            'Layering Rule',
            'Tokens',
            'Visual Diff Workflow',
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

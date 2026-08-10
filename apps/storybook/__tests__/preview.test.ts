// @vitest-environment jsdom
//
// jsdom rather than the suite's node default: both decorators exist to write to
// the DOM — `data-theme` on <html>, the reset on the capture target — and a stub
// of `dataset` would only assert against the stub. No story renders here; the
// decorators are handed a story that returns a sentinel.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CAPTURE_TARGET,
  COLOR_SCHEME_GLOBAL,
  THEMES,
  VIEWPORTS,
} from '@gate/visual-diff/policy';
import { beforeEach, describe, expect, it } from 'vitest';
import preview from '../.storybook/preview';

/**
 * The preview is the policy consumer, so every case here pins one of its
 * settings to the policy module rather than to a value written down twice. The
 * failure this guards is specific and silent: name the global `theme` in the
 * toolbar while the capture URL sets `colorScheme` and every dark shot renders
 * light, which lands as byte-identical baselines that look like a passing gate.
 */

const source = fs.readFileSync(
  path.join(import.meta.dirname, '..', '.storybook', 'preview.tsx'),
  'utf8',
);

const STORY = Symbol('story');

/** The decorator signature, narrowed to what these cases supply: Storybook's own
 *  `StoryContext` carries thirty fields none of this reads. */
type PreviewDecorator = (
  story: () => symbol,
  context: { globals: Record<string, string> },
) => unknown;

const decorators = (preview.decorators ?? []) as unknown as PreviewDecorator[];

const globalTypes = (preview.globalTypes ?? {}) as Record<
  string,
  { toolbar?: { items?: readonly string[] } }
>;

const initialGlobals = (preview.initialGlobals ?? {}) as Record<string, string>;

const viewportOptions = (preview.parameters?.viewport?.options ?? {}) as Record<
  string,
  { styles: { width: string; height: string } }
>;

/** The theme the toolbar starts on — the one `tokens.css` renders with no
 *  `data-theme` attribute present at all. */
const initialTheme = initialGlobals[COLOR_SCHEME_GLOBAL] as string;

/** Any theme that is not the initial one — the attribute has to be written for
 *  these and removed again on the way back. */
const otherTheme = THEMES.find((theme) => theme !== initialTheme) as string;

/** Runs every decorator over one story, the way Storybook does per render. */
const renderWith = (globals: Record<string, string>) => {
  for (const decorate of decorators) decorate(() => STORY, { globals });
};

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  document.body.innerHTML = '';
});

describe('the colorScheme global', () => {
  it('is keyed by the name policy hands both consumers', () => {
    const names = Object.keys(globalTypes);

    expect(names).toContain(COLOR_SCHEME_GLOBAL);
  });

  it('is a global rather than a parameter, so the capture URL can drive it', () => {
    const parameterNames = Object.keys(preview.parameters ?? {});

    expect(parameterNames).not.toContain(COLOR_SCHEME_GLOBAL);
  });

  it('offers exactly the themes the matrix captures', () => {
    const items = globalTypes[COLOR_SCHEME_GLOBAL]?.toolbar?.items;

    expect(items).toEqual([...THEMES]);
  });

  it('starts on a theme policy knows', () => {
    const start = initialGlobals[COLOR_SCHEME_GLOBAL];

    expect(THEMES).toContain(start);
  });
});

describe('the theme decorator', () => {
  it.each(THEMES.filter((theme) => theme !== initialTheme))(
    '%s reaches <html> as data-theme',
    (theme) => {
      renderWith({ [COLOR_SCHEME_GLOBAL]: theme });

      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );

  it('clears the attribute a previous story left behind', () => {
    renderWith({ [COLOR_SCHEME_GLOBAL]: otherTheme });

    renderWith({ [COLOR_SCHEME_GLOBAL]: initialTheme });

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('leaves the root unset when the toolbar has no value yet', () => {
    renderWith({});

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('never asks the operating system what theme to render', () => {
    const media = source.includes('prefers-color-scheme');

    expect(media).toBe(false);
  });
});

describe('the viewport globals', () => {
  it('are the viewports policy captures at, keyed the same way', () => {
    const names = Object.keys(viewportOptions);

    expect(names).toEqual(Object.keys(VIEWPORTS));
  });

  it.each(Object.entries(VIEWPORTS))('%s is policy’s pixels', (name, size) => {
    const styles = viewportOptions[name]?.styles;

    expect(styles).toEqual({ width: `${size.width}px`, height: `${size.height}px` });
  });
});

describe('the capture-target reset', () => {
  it('flattens the element every non-fullpage shot is taken of', () => {
    document.body.innerHTML = `<div id="${CAPTURE_TARGET.slice(1)}" style="padding:1rem"></div>`;
    const root = document.querySelector<HTMLElement>(CAPTURE_TARGET);

    renderWith({ [COLOR_SCHEME_GLOBAL]: initialTheme });

    expect({ display: root?.style.display, padding: root?.style.padding }).toEqual({
      display: 'block',
      padding: '0px',
    });
  });

  it('renders a story mounted somewhere the target does not exist', () => {
    const render = () => renderWith({ [COLOR_SCHEME_GLOBAL]: initialTheme });

    expect(render).not.toThrow();
  });
});

describe('the policy literals', () => {
  // A hand-copied value here is the drift the policy module exists to prevent,
  // and nothing else in the repo would notice it: the toolbar would keep working
  // while the differ captured a viewport Storybook never renders at.
  const restatements = [
    CAPTURE_TARGET,
    ...Object.values(VIEWPORTS).flatMap(({ width, height }) => [
      String(width),
      String(height),
    ]),
  ];

  it.each(restatements)('%s is imported, never written here', (literal) => {
    const restated = source.includes(literal);

    expect(restated).toBe(false);
  });
});

describe('every decorator', () => {
  it.each(decorators.map((decorate, index) => [index, decorate] as const))(
    'renders the story it wraps (%i)',
    (_index, decorate) => {
      const rendered = decorate(() => STORY, {
        globals: { [COLOR_SCHEME_GLOBAL]: initialTheme },
      });

      expect(rendered).toBe(STORY);
    },
  );
});

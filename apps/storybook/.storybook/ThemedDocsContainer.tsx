import { useEffect, useState, type ReactElement } from 'react';
import { GLOBALS_UPDATED, SET_GLOBALS } from 'storybook/internal/core-events';
import { themes } from 'storybook/theming';
import { DocsContainer, type DocsContainerProps } from '@storybook/addon-docs/blocks';
import { COLOR_SCHEME_GLOBAL } from '@gate/visual-diff/policy';
import { applyColorScheme, UNSET_THEME } from './color-scheme';

interface GlobalsPayload {
  globals?: Record<string, unknown>;
}

function readColorScheme(payload: GlobalsPayload | undefined): string | undefined {
  const value = payload?.globals?.[COLOR_SCHEME_GLOBAL];
  return typeof value === 'string' ? value : undefined;
}

/** `withColorScheme` in preview.tsx only runs for a rendered `<Story>` — a pure-MDX
 *  docs page (no `<Story>`/`<Canvas>` embed, which is every page under src/docs
 *  today) never triggers one, so the toolbar's Theme toggle silently did nothing on
 *  every Docs page: confirmed live, loading a docs page with the global set to dark
 *  left `data-theme` unset and the page rendered in the light tokens regardless.
 *
 *  The obvious fix — read the global with `useGlobals()` from `storybook/preview-api`
 *  — throws: that hook (like `useStoryContext`, which it's built on) only works
 *  inside Storybook's own story-render hooks context, which a docs container never
 *  renders within. `context.channel` has no such restriction — it's a plain prop on
 *  `DocsContainerProps` — so this reads the same `globals` events the story hooks
 *  read from internally instead, directly off the channel.
 *
 *  `SET_GLOBALS`/`GLOBALS_UPDATED` both fire once, early, during preview boot,
 *  independent of any story rendering — confirmed live, they'd already fired with
 *  the URL's `colorScheme:dark` by the time this component's effect ran, so a plain
 *  `channel.on(...)` subscription alone missed them and stayed on the light default.
 *  `channel.last(eventName)` returns that already-fired payload (as `[payload]`,
 *  matching `emit(eventName, ...args)`), which is what seeds the initial read below;
 *  `.on(...)` then covers every later toolbar change the same way.
 *
 *  `applyColorScheme` alone is not enough: it only ever reaches `document.body`, but
 *  addon-docs wraps every docs page's own content in `.sbdocs-wrapper`, which carries
 *  a hardcoded opaque white background from `@storybook/theming`'s own default theme
 *  — confirmed live, `data-theme="dark"` was correctly set and `body`'s computed
 *  background genuinely was our dark token, while the actual visible surface stayed
 *  white because that wrapper sits on top of it, unrelated to our CSS custom
 *  properties. `theme` on `DocsContainerProps` is addon-docs's own hook for this —
 *  passing `themes.dark`/`themes.light` (its own built-in presets, not our design
 *  tokens: this only reaches addon-docs's chrome — the wrapper background, headings,
 *  ArgTypes/Source blocks — the content itself already inherits our real tokens once
 *  the wrapper stops painting over them) is what actually makes the wrapper follow
 *  the toggle instead of only the attribute underneath it. */
export function ThemedDocsContainer({
  context,
  ...rest
}: DocsContainerProps): ReactElement {
  const { channel } = context;
  const [theme, setTheme] = useState<string>(
    () =>
      readColorScheme(channel.last(GLOBALS_UPDATED)?.[0]) ??
      readColorScheme(channel.last(SET_GLOBALS)?.[0]) ??
      UNSET_THEME,
  );

  useEffect(() => {
    const onGlobalsPayload = (payload: GlobalsPayload) => {
      const next = readColorScheme(payload);
      if (next !== undefined) {
        setTheme(next);
      }
    };

    channel.on(SET_GLOBALS, onGlobalsPayload);
    channel.on(GLOBALS_UPDATED, onGlobalsPayload);

    return () => {
      channel.off(SET_GLOBALS, onGlobalsPayload);
      channel.off(GLOBALS_UPDATED, onGlobalsPayload);
    };
  }, [channel]);

  useEffect(() => {
    applyColorScheme(theme);
  }, [theme]);

  return (
    <DocsContainer
      context={context}
      {...rest}
      theme={theme === UNSET_THEME ? themes.light : themes.dark}
    />
  );
}

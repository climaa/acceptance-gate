import { useEffect, useState, type ReactElement } from 'react';
import { GLOBALS_UPDATED, SET_GLOBALS } from 'storybook/internal/core-events';
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
 *  `.on(...)` then covers every later toolbar change the same way. */
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

  return <DocsContainer context={context} {...rest} />;
}

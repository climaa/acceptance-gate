import type { ComponentType } from 'react';
import NextLink from 'next/link';
import { SiteHeader } from '@gate/ui';
import { Brand, SampleBanner } from '@/components/ConsoleChrome';
import { MANUAL_NAV } from '@/lib/site';
// The console's own sheets, which the layout reaches through `globals.css`. The
// design system's arrives with Storybook's preview, and `globals.css` imports it
// again; Vite loads one module once, so it is not applied twice.
import '../globals.css';

/** The answers a screen's client components poll for, as a sample instance on a
 *  deployment gives them: nothing running, nothing to start, no corpus to pick
 *  from. Keyed by path, so a request this list does not name fails loudly in the
 *  story rather than reaching a server Storybook does not have. */
const SAMPLE_ANSWERS: Readonly<Record<string, unknown>> = {
  '/api/jobs/current': {
    isSample: true,
    running: false,
    job: null,
    reportExists: false,
    log: [],
  },
  '/api/env': {
    platform: 'linux',
    arch: 'x64',
    image: null,
    playwright: null,
    docker: false,
  },
  '/api/stories': { tiers: [] },
};

/** Replaces `fetch` for the story's lifetime with {@link SAMPLE_ANSWERS}, and
 *  returns the restore Storybook calls when the story unmounts. */
export function answerAsSample(): () => void {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    const answer = SAMPLE_ANSWERS[url.pathname];

    return answer === undefined
      ? new Response(null, { status: 404 })
      : Response.json(answer);
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}

/**
 * A screen's story, drawn as a visitor sees the page: inside the header and
 * `main` the root layout draws, with the sample banner, at `pathname`.
 *
 * For stories only. The layout itself reads the data directory and cannot be
 * imported here, which is why its pieces live in `components/ConsoleChrome.tsx`.
 */
export function inConsole(pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <>
          <SiteHeader brand={<Brand />} nav={MANUAL_NAV} as={NextLink} container="full" />
          <main id="main" className="ds-container ds-container--full">
            <SampleBanner />
            <Story />
          </main>
        </>
      ),
    ],
    beforeEach: answerAsSample,
    parameters: {
      // Edge to edge, as a browser window draws the page: no canvas padding.
      layout: 'fullscreen',
      nextjs: { appDirectory: true, navigation: { pathname } },
    },
  };
}

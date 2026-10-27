import type { ComponentType } from 'react';
import { logger } from '@gate/logger';
import { ConsoleFrame, SampleBanner } from '@/components/ConsoleChrome';
import type { CurrentJobResponse, RunnerEnv, StoriesResponse } from '@/lib/api-contract';
// The console's own sheets, which the layout reaches through `globals.css`. The
// design system's arrives with Storybook's preview, and `globals.css` imports it
// again; Vite loads one module once, so it is not applied twice.
import '../globals.css';

/** The answers a screen's client components poll for, as a sample instance on a
 *  deployment gives them: nothing running, nothing to start, no corpus to pick
 *  from. Each is checked against the type its route promises, so a contract
 *  change fails the typecheck here rather than turning into a parse error that
 *  the hooks absorb and the baseline photographs. */
const SAMPLE_ANSWERS: Readonly<Record<string, unknown>> = {
  '/api/jobs/current': {
    isSample: true,
    running: false,
    job: null,
    reportExists: false,
    log: [],
  } satisfies CurrentJobResponse,
  '/api/env': {
    platform: 'linux',
    arch: 'x64',
    image: null,
    playwright: null,
    docker: false,
  } satisfies RunnerEnv,
  '/api/stories': { tiers: [] } satisfies StoriesResponse,
};

/** Replaces `fetch` for the story's lifetime with {@link SAMPLE_ANSWERS}, and
 *  returns the restore Storybook calls when the story unmounts.
 *
 *  A request no entry names answers 404, which the console's hooks read as an
 *  unreachable server, quietly. So it is also logged as an error: a client
 *  component that starts asking a new route shows up in the story's console
 *  instead of only as a changed screenshot. */
export function answerAsSample(): () => void {
  const realFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    const answer = SAMPLE_ANSWERS[url.pathname];

    if (answer === undefined) {
      logger.error(`screen story: no sample answer for ${url.pathname}`);
      return new Response(null, { status: 404 });
    }

    return Response.json(answer);
  };

  return () => {
    globalThis.fetch = realFetch;
  };
}

/**
 * A screen's story, drawn as a visitor sees the page: inside the frame the root
 * layout draws (`ConsoleFrame`), with the sample banner, at `pathname`.
 *
 * For stories only. The layout itself reads the data directory and cannot be
 * imported here, which is why its pieces live in `components/ConsoleChrome.tsx`.
 */
export function inConsole(pathname: string) {
  return {
    decorators: [
      (Story: ComponentType) => (
        <ConsoleFrame notice={<SampleBanner />}>
          <Story />
        </ConsoleFrame>
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

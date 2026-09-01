import type { Page } from '@playwright/test';

/**
 * The comment service, faked at the network boundary.
 *
 * A suite that gates merges cannot depend on giscus.app being up, on a GitHub
 * Discussions category existing, or on a rate limit somebody else is spending.
 * Left real, this file's scenarios would be a check that goes red for reasons
 * that have nothing to do with the commit under review — which is the one thing
 * a required check must never do.
 *
 * What is faked is the CONTRACT the component actually depends on, and no more
 * of it: a script that mounts an iframe, and an iframe that says the discussion
 * is here. Everything the component decides — that the message came from the
 * right origin, that it is the metadata shape and not a resize, that it came
 * from the frame being waited on — still runs for real against it.
 *
 * Fulfilled rather than injected, and that is the point of doing it this way.
 * The frame is served AT `https://giscus.app`, so `event.origin` is the real
 * origin and `event.source` is a real cross-origin `contentWindow`. A fake that
 * injected the message from inside the page would post from the blog's own
 * origin, and would sail past the two checks that exist to reject exactly
 * that.
 */

const ORIGIN = 'https://giscus.app';
const SCRIPT_URL = `${ORIGIN}/client.js`;

/** Where the fake frame is served. Not a giscus address — nothing real is being imitated. */
const THREAD_PATH = '/__e2e__/thread';

/**
 * Stands in for `client.js`.
 *
 * Reads its own `data-term` and mounts a frame beside itself, which is what the
 * real loader does and is the only part of its behaviour the component is
 * written against. The term is carried into the frame's URL so a scenario can
 * tell one release's embed from another's.
 */
const CLIENT_JS = `
(function () {
  var script = document.currentScript;
  var term = script.getAttribute('data-term') || '';
  var frame = document.createElement('iframe');
  frame.src = '${ORIGIN}${THREAD_PATH}?term=' + encodeURIComponent(term);
  frame.title = 'Comments';
  frame.setAttribute('data-term', term);
  script.parentElement.appendChild(frame);
})();
`;

/**
 * Stands in for the embed.
 *
 * Posts the metadata message — the signal that means a discussion rendered, the
 * one `data-emit-metadata="1"` asks for and the only thing the control accepts
 * as success. `'*'` as the target because the blog's origin differs between a
 * local run and CI, and the check that matters is the one the PARENT makes
 * about this frame, not one this frame makes about the parent.
 */
const THREAD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Comments</title></head>
<body>
<script>
  var term = new URL(location.href).searchParams.get('term');
  parent.postMessage({ giscus: { discussion: { title: term } } }, '*');
</script>
</body></html>`;

export class Giscus {
  constructor(private readonly page: Page) {}

  /** The service, up: a press mounts a thread and the thread announces itself. */
  async serveWorkingEmbed() {
    await this.page.route(SCRIPT_URL, (route) =>
      route.fulfill({ contentType: 'application/javascript', body: CLIENT_JS }),
    );

    await this.page.route(`${ORIGIN}${THREAD_PATH}*`, (route) =>
      route.fulfill({ contentType: 'text/html', body: THREAD_HTML }),
    );
  }

  /**
   * The service, unreachable.
   *
   * The loader is aborted rather than answered with an error status, because a
   * blocked third party is what this actually looks like in the wild — an
   * extension, a content blocker, a network that drops the host — and an
   * aborted script is what fires the `error` event the control settles on. A
   * 500 would load a script that then did nothing, which is the timeout's case
   * and takes fifteen seconds to reach.
   */
  async serveUnreachable() {
    await this.page.route(SCRIPT_URL, (route) => route.abort('failed'));
  }

  /**
   * How many embeds have been mounted, across every release.
   *
   * The number is the claim in two scenarios: that pressing a control whose
   * thread is already open mounts nothing new, and that nothing is mounted
   * until somebody asks.
   */
  async mountedThreadCount(): Promise<number> {
    return this.page.locator('[data-release-comments] iframe').count();
  }
}

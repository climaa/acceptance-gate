import type { Page, Response } from '@playwright/test';

/**
 * The blog as `next dev` serves it — the port `apps/blog`'s own `dev` script
 * names, so `pnpm dev` already has this up and the local config reuses it.
 *
 * Not `baseURL`. That belongs to the visual-diff console on 3300, and this lane
 * now boots two servers, so an address here is absolute for the same reason the
 * acceptance lane's `VD_HOSTS` are: a relative path would silently land on
 * whichever app the config happened to point at.
 */
export const BLOG_DEV_URL = 'http://localhost:3000';

/**
 * The blog under a dev server, addressed directly.
 *
 * The acceptance lane's `PostPage` is the same app against `next start`, and
 * every claim it makes is about a build. This one exists for the claims that are
 * only true of `next dev` — where the content on disk is being edited while the
 * server runs, and the question is whether the server has noticed.
 */
export class BlogDevPage {
  constructor(private readonly page: Page) {}

  /** The response, not the render: what these scenarios compare is the status. */
  async request(pathname: string): Promise<Response | null> {
    return this.page.goto(`${BLOG_DEV_URL}${pathname}`);
  }
}

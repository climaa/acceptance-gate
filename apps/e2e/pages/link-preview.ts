import type { APIRequestContext, Page } from '@playwright/test';

/** Who asks, when a scenario does not name a crawler. Facebook's fetcher is the
 *  one Upwork, WhatsApp and LinkedIn's own fallbacks behave most like: it runs
 *  no JavaScript, so what it reads is the server's HTML and nothing else. */
export const DEFAULT_CRAWLER = 'facebookexternalhit/1.1';

/** What a preview cannot go without. Every other tag a card can carry is a
 *  refinement; a page missing one of these previews as the bare host. */
export const PREVIEW_TAGS = [
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'twitter:card',
] as const;

/** One page as a crawler reads it: the raw response, never a rendered DOM. */
export interface Preview {
  path: string;
  status: number;
  /** Every `og:*` and `twitter:*` tag, by name, with where it sits. */
  tags: Map<string, { content: string; inHead: boolean }>;
  canonical: string | null;
}

/** How a scenario names a page, resolved against the sitemap rather than typed,
 *  so the scenarios do not go stale when the next post is published. */
const PAGES: Record<string, (paths: string[]) => string | undefined> = {
  'the home page': (paths) => paths.find((path) => path === '/'),
  'the blog index': (paths) => paths.find((path) => path === '/blog'),
  'a later page of the index': (paths) =>
    paths.find((path) => /^\/blog\/page\/\d+$/.test(path)),
  'the first article': (paths) =>
    paths.find((path) => /^\/blog\/[^/]+$/.test(path) && !path.startsWith('/blog/page')),
  'a tag page': (paths) => paths.find((path) => path.startsWith('/tags/')),
  'the about page': (paths) => paths.find((path) => path === '/about'),
  'the changelog': (paths) => paths.find((path) => path === '/changelog'),
};

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
}

/** The tags, read off the raw markup. A regex rather than a DOM parser on
 *  purpose: the claim is about bytes on the wire, before any browser touched
 *  them, and `</head>`'s offset is what separates a tag in the head from one
 *  streamed into the body. */
export function parsePreview(path: string, status: number, html: string): Preview {
  const headEnd = html.indexOf('</head>');
  const tags: Preview['tags'] = new Map();

  for (const match of html.matchAll(/<meta\s[^>]*>/g)) {
    const name = attribute(match[0], 'property') ?? attribute(match[0], 'name');
    const content = attribute(match[0], 'content');
    if (!name || content === null || !/^(og|twitter):/.test(name)) continue;
    if (!tags.has(name)) tags.set(name, { content, inHead: match.index < headEnd });
  }

  const link = html.match(/<link\s[^>]*rel="canonical"[^>]*>/)?.[0];

  return { path, status, tags, canonical: link ? attribute(link, 'href') : null };
}

/** The width and height a PNG declares in its IHDR chunk. */
export function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * The blog as a link-preview fetcher sees it: plain HTTP requests, no browser,
 * redirects not followed.
 *
 * The addresses the pages publish are absolute and name the production origin.
 * Every request is still made against the build under test — the origin is
 * checked, then swapped for this server's — or the suite would be grading the
 * site already deployed rather than the change in front of it.
 */
export class LinkPreviews {
  private readonly request: APIRequestContext;

  constructor(page: Page) {
    this.request = page.request;
  }

  /** The sitemap as the site writes it: the origin it publishes under, and the
   *  path of every page in it. */
  async sitemap(): Promise<{ origin: string; paths: string[] }> {
    const xml = await (await this.request.get('/sitemap.xml')).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      ([, loc = '']) => new URL(loc),
    );
    const [first] = urls;
    if (!first) throw new Error('/sitemap.xml lists no page');

    return { origin: first.origin, paths: urls.map((url) => url.pathname) };
  }

  async pathOf(page: string): Promise<string> {
    const resolve = PAGES[page];
    if (!resolve) throw new Error(`No page is known as "${page}"`);

    const path = resolve((await this.sitemap()).paths);
    if (!path) throw new Error(`The sitemap lists no page that is ${page}`);
    return path;
  }

  async read(path: string, crawler = DEFAULT_CRAWLER): Promise<Preview> {
    const response = await this.request.get(path, {
      headers: { 'user-agent': crawler },
      maxRedirects: 0,
    });

    return parsePreview(path, response.status(), await response.text());
  }

  async readAll(crawler = DEFAULT_CRAWLER): Promise<Preview[]> {
    const { paths } = await this.sitemap();
    return Promise.all(paths.map((path) => this.read(path, crawler)));
  }

  /** An absolute image address, fetched from this server rather than the one it
   *  names. */
  async image(address: string) {
    const url = new URL(address);
    const response = await this.request.get(`${url.pathname}${url.search}`, {
      headers: { 'user-agent': DEFAULT_CRAWLER },
      maxRedirects: 0,
    });

    return {
      status: response.status(),
      contentType: response.headers()['content-type'],
      bytes: await response.body(),
    };
  }
}

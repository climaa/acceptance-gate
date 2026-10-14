/**
 * What a link to the published Storybook previews as.
 *
 * Every page of it is `index.html` — vercel.json redirects `/` to
 * `/index.html?path=/docs/docs-welcome--docs` — and a link fetcher runs no
 * JavaScript, so the only head it ever reads is the manager's static one. With
 * nothing in it, a pasted link previewed as the bare host. The tags go in
 * through `managerHead`, beside the analytics beacon, because this is a static
 * build: there is no Next metadata to set.
 *
 * The words are not typed here. They are read from what the Storybook already
 * publishes: the title its manager gives the page the root lands on, and the
 * lead of that page, `src/docs/Welcome.mdx`. Reword the welcome page and the
 * preview follows it.
 *
 * No image. A card is a design decision and a build step this static app does
 * not have, so the card type is `summary` and there is no `og:image`.
 */
import { attributeValue } from './analytics-head.ts';

/** The address the root redirect starts from, and so the one every share should
 *  fold back onto: `og:url` and the canonical both name it. */
export const PUBLISHED_URL = 'https://storybook.carloslima.dev/';

/** The manager's own name for itself: the `<title>` its template falls back to,
 *  and the suffix it puts on every page title. */
const SITE_NAME = 'Storybook';

/** The welcome page's sidebar entry is a docs page, and Storybook names a docs
 *  entry with no other name `Docs`. */
const DOCS_ENTRY_NAME = 'Docs';

export type PreviewWords = { title: string; description: string };

/**
 * The title the manager sets once the welcome page has loaded — `getDescription`
 * in `storybook/dist/manager/runtime.js`, applied to that entry. A fetcher never
 * runs the script that sets it; a reader sees it in the tab.
 */
const managerTitle = (metaTitle: string) =>
  `${metaTitle} - ${DOCS_ENTRY_NAME} ⋅ ${SITE_NAME}`.split('/').join(' / ');

/** Inline markdown down to the text a reader sees: link text kept, code ticks
 *  and emphasis dropped, the source's line wrapping folded into spaces. */
const plainText = (markdown: string) =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The first paragraph after the page's `# ` heading. */
const leadOf = (mdx: string) => {
  const afterHeading = mdx.split(/^# .*$/m)[1] ?? '';

  return afterHeading.trim().split(/\n\s*\n/)[0] ?? '';
};

/**
 * The title and description, out of the welcome page's source.
 *
 * Throws rather than falling back: a preview with a guessed sentence in it is
 * exactly what this exists to stop, and a throw here fails `storybook build`,
 * where whoever reworded the page will see it.
 */
export const welcomeWords = (mdx: string): PreviewWords => {
  const metaTitle = /<Meta\s+title="([^"]+)"/.exec(mdx)?.[1];
  const description = plainText(leadOf(mdx));

  if (!metaTitle) throw new Error('Welcome.mdx has no <Meta title> to read');
  if (!description) throw new Error('Welcome.mdx has no lead paragraph to read');

  return { title: managerTitle(metaTitle), description };
};

const property = (name: string, content: string) =>
  `<meta property="${name}" content=${attributeValue(content)} />`;

/** The preview tags for the welcome page whose source is `mdx`. */
export const linkPreviewHead = (mdx: string): string => {
  const { title, description } = welcomeWords(mdx);

  return [
    property('og:title', title),
    property('og:description', description),
    property('og:url', PUBLISHED_URL),
    property('og:site_name', SITE_NAME),
    property('og:type', 'website'),
    `<link rel="canonical" href=${attributeValue(PUBLISHED_URL)} />`,
    '<meta name="twitter:card" content="summary" />',
  ].join('\n');
};

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import RootLayout from '../app/layout';
import rootManifest from '../../../package.json';
import {
  APP_NAME,
  APP_TAGLINE,
  PROJECT_NAME,
  SAMPLE_LABEL,
  SITE_TITLE,
} from '../lib/site';
import { THEME_SCRIPT } from '../lib/theme';

/**
 * The frame every route renders inside: which links exist, where the page
 * lands, when the sample badge is drawn — and, above all, that the badge is
 * decided per request rather than baked into the shell.
 *
 * A streaming renderer rather than `renderToStaticMarkup`, because the badge is
 * an async component behind `<Suspense>` — which is exactly the property under
 * test. What any of it looks like is the differ's, per CODING_STANDARDS.
 */

const shell = async (children: ReactNode = null): Promise<string> => {
  const stream = await renderToReadableStream(
    createElement(RootLayout, null, children) as ReactElement,
  );
  await stream.allReady;

  return new Response(stream).text();
};

/** Each anchor as `{ href, text }`, in document order, inner markup stripped. */
const linksIn = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, inner]) => ({ href, text: (inner ?? '').replace(/<[^>]*>/g, '') }),
  );

const temporaryDirs: string[] = [];

function seededDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-shell-'));
  temporaryDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify({ sets: [] }));

  return dir;
}

afterEach(() => {
  delete process.env.VISUAL_DIFF_DATA_DIR;
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('the app shell', () => {
  // First in the DOM is what makes it the first tab stop, which is the whole
  // reason the atom exists.
  it('puts the skip link ahead of every other link', async () => {
    const [first] = linksIn(await shell());

    expect(first).toEqual({ href: '#main', text: 'Skip to content' });
  });

  it('lands the skip link on the main landmark', async () => {
    const html = await shell();

    expect(html).toMatch(/<main\b[^>]*\bid="main"/);
  });

  it('links the brand home', async () => {
    const links = linksIn(await shell());

    expect(links).toContainEqual({
      href: '/',
      text: `${PROJECT_NAME}/${APP_NAME}${APP_TAGLINE}`,
    });
  });

  // Every child project ships this console, so the header says whose it is.
  // Read from the root manifest, so a child's copy names the child unedited.
  it("names the repository's project before the wordmark", () => {
    expect(PROJECT_NAME).toBe(rootManifest.name);
  });

  it('keeps the project out of the heading', async () => {
    const html = await shell();

    expect(html).toMatch(new RegExp(`>${PROJECT_NAME}</span>`));
    expect(html).not.toMatch(new RegExp(`<h1[^>]*>[^<]*${PROJECT_NAME}`));
  });

  it('titles the tab with the console, then its project', () => {
    expect(SITE_TITLE).toBe(`${APP_NAME} · ${PROJECT_NAME}`);
  });

  // The board draws the wordmark row as the console's title, so it is the
  // page's heading rather than a decorative brand above one.
  it('makes the wordmark the heading', async () => {
    const html = await shell();

    expect(html).toMatch(new RegExp(`<h1[^>]*>${APP_NAME}</h1>`));
  });

  it('renders the theme toggle', async () => {
    const html = await shell();

    expect(html).toMatch(/<button\b[^>]*aria-pressed=/);
  });

  it('restores the stored theme before the first paint', async () => {
    const html = await shell();

    expect(html).toContain(THEME_SCRIPT);
  });
});

describe('the sample badge', () => {
  it('is drawn on a screen fed from the committed fixtures', async () => {
    const html = await shell();

    expect(html).toMatch(
      new RegExp(`<div[^>]*role="status"[^>]*aria-label="${SAMPLE_LABEL}"`),
    );
  });

  // The property the whole data layer is shaped around: one build serves both
  // the sample instance and every seeded e2e world, so this answer cannot be
  // the one that was true when `next build` ran.
  it('is absent once a data directory of its own is configured', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = seededDataDir();

    const html = await shell();

    expect(html).not.toContain('role="status"');
    expect(html).not.toContain(SAMPLE_LABEL);
  });
});

/**
 * The faces the first screen paints in, spelled out rather than imported: an
 * expectation that reads the layout's own list cannot catch that list being
 * wrong. Four, where the blog has three — the console's first screen is set in
 * JetBrains Mono as much as in anything else.
 */
const ABOVE_THE_FOLD_FACES = [
  'atkinson-hyperlegible-latin-400-normal.woff2',
  'atkinson-hyperlegible-latin-700-normal.woff2',
  'fraunces-latin-600-normal.woff2',
  'jetbrains-mono-latin-400-normal.woff2',
];

const fontPreloads = async () => {
  const html = await shell();
  const head = html.slice(0, html.indexOf('</head>'));

  return (head.match(/<link\b[^>]*>/g) ?? []).filter((tag) => /\bas="font"/.test(tag));
};

/** The committed file name behind a bundled asset URL, hash and query stripped. */
const faceOf = (tag: string) =>
  (/href="([^"]*)"/.exec(tag)?.[1] ?? '')
    .replace(/^.*\//, '')
    .replace(/\?.*$/, '')
    .replace(/\.[^.]+\.woff2$/, '.woff2');

describe('the font preloads', () => {
  // `font-display: block` holds text invisible until its face arrives; without
  // a preload the browser only discovers a face once the stylesheet parses.
  it('covers the faces the first screen paints in', async () => {
    const preloaded = (await fontPreloads()).map(faceOf);

    expect(preloaded.sort()).toEqual(ABOVE_THE_FOLD_FACES);
  });

  it('declares crossorigin and the woff2 type on every face', async () => {
    const preloads = await fontPreloads();

    expect(preloads.every((tag) => /\bcrossorigin=/.test(tag))).toBe(true);
    expect(preloads.every((tag) => tag.includes('type="font/woff2"'))).toBe(true);
  });
});

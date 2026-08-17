import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToReadableStream } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import RootLayout from '../app/layout';
import { APP_NAME, APP_TAGLINE, SAMPLE_LABEL } from '../lib/site';
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

    expect(links).toContainEqual({ href: '/', text: `${APP_NAME}${APP_TAGLINE}` });
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

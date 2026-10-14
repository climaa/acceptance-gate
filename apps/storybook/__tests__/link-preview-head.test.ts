// @vitest-environment jsdom
//
// jsdom for the same reason analytics-head.test.ts gives: the subject emits
// HTML, so it is read back through a real parser rather than grepped.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  linkPreviewHead,
  PUBLISHED_URL,
  welcomeWords,
} from '../.storybook/link-preview-head';
import config from '../.storybook/main';

const WELCOME = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', 'src', 'docs', 'Welcome.mdx'),
  'utf8',
);

/** A whole document, so the parser decides where each node belongs: anything
 *  that is not head content — text, an element `<head>` cannot hold — is moved
 *  into `<body>`, which is how a stray tag would show up on the page. */
const parseDocument = (head: string) =>
  new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head>${head}</head><body></body></html>`,
    'text/html',
  );

const meta = (doc: Document, attribute: 'property' | 'name', key: string) =>
  doc.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content');

type ManagerHead = (head: string | undefined) => string | undefined;

const callManagerHead = (head: string | undefined) =>
  (config.managerHead as unknown as ManagerHead)(head) ?? '';

describe('the words a link previews with', () => {
  it('are the landing page title the manager gives the welcome docs page', () => {
    const words = welcomeWords(WELCOME);

    // getDescription in storybook/dist/manager/runtime.js, applied to the
    // entry vercel.json's root redirect lands on.
    expect(words.title).toBe('Docs / Welcome - Docs ⋅ Storybook');
  });

  it("are the welcome page's lead, as a reader sees it", () => {
    const words = welcomeWords(WELCOME);

    expect(words.description).toMatch(/^This repo is a design system and a blog/);
    expect(words.description).toContain('before it reaches main.');
    expect(words.description).not.toMatch(/[`*\n]/);
  });

  it('refuse to guess when the welcome page has no lead to read', () => {
    const read = () => welcomeWords('<Meta title="Docs/Welcome" />\n\n# Welcome\n');

    expect(read).toThrow(/lead/);
  });
});

describe('the manager head', () => {
  const doc = parseDocument(linkPreviewHead(WELCOME));

  it.each([
    ['og:title', 'Docs / Welcome - Docs ⋅ Storybook'],
    ['og:url', PUBLISHED_URL],
    ['og:site_name', 'Storybook'],
    ['og:type', 'website'],
  ])('carries %s', (property, expected) => {
    expect(meta(doc, 'property', property)).toBe(expected);
  });

  it('carries og:description, the lead', () => {
    expect(meta(doc, 'property', 'og:description')).toBe(
      welcomeWords(WELCOME).description,
    );
  });

  it('carries a summary twitter card, with no image', () => {
    expect(meta(doc, 'name', 'twitter:card')).toBe('summary');
    expect(doc.querySelector('meta[property="og:image"]')).toBeNull();
  });

  it('names a canonical equal to og:url', () => {
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');

    expect(canonical).toBe(meta(doc, 'property', 'og:url'));
  });

  it('renders nothing outside <head>', () => {
    expect(doc.body.childNodes).toHaveLength(0);
  });

  it('cannot be broken out of by a quote in the words it reads', () => {
    const head = linkPreviewHead(
      '<Meta title="Docs/Welcome" />\n\n# Welcome\n\nA "quoted" <b>lead</b> & more.\n',
    );

    const parsed = parseDocument(head);

    expect(parsed.body.childNodes).toHaveLength(0);
    expect(meta(parsed, 'property', 'og:description')).toBe(
      'A "quoted" <b>lead</b> & more.',
    );
  });
});

describe('the wiring in main.ts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['production', 'preview'])(
    'writes the preview tags on a %s build',
    (VERCEL_ENV) => {
      vi.stubEnv('VERCEL_ENV', VERCEL_ENV);

      const doc = parseDocument(callManagerHead('<meta name="sentinel" />'));

      expect(doc.querySelector('meta[name="sentinel"]')).not.toBeNull();
      expect(meta(doc, 'property', 'og:url')).toBe(PUBLISHED_URL);
    },
  );
});

import { createElement, type ReactNode } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import { SITE_COPYRIGHT, SITE_COPYRIGHT_YEAR, SITE_TITLE } from '../lib/site';

/**
 * The frame every route renders inside, now that `SiteHeader` and `SiteFooter`
 * draw it instead of markup this app kept its own copy of.
 *
 * Structure and wiring only: which links exist, where the page lands, and that
 * the footer reads no clock. What any of it looks like is the differ's, per
 * CODING_STANDARDS.
 */

const shell = (children: ReactNode = null) =>
  renderToStaticMarkup(createElement(RootLayout, null, children));

/** Each anchor as `{ href, text }`, in document order, inner markup stripped. */
const linksIn = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, inner]) => ({ href, text: (inner ?? '').replace(/<[^>]*>/g, '') }),
  );

describe('the site header', () => {
  it('links the brand home', () => {
    const links = linksIn(shell());

    expect(links).toContainEqual({ href: '/', text: SITE_TITLE });
  });

  it('renders one nav link per section', () => {
    const links = linksIn(shell());

    expect(links).toContainEqual({ href: '/blog', text: 'Blog' });
    expect(links).toContainEqual({ href: '/about', text: 'About' });
  });

  // First in the DOM is what makes it the first tab stop, which is the whole
  // reason the atom exists.
  it('puts the skip link ahead of every other link', () => {
    const [first] = linksIn(shell());

    expect(first).toEqual({ href: '#main', text: 'Skip to content' });
  });

  it('renders the theme toggle', () => {
    const html = shell();

    expect(html).toMatch(/<button\b[^>]*aria-pressed=/);
  });
});

describe('the main landmark', () => {
  it('carries the id the skip link jumps to', () => {
    const html = shell();

    expect(html).toMatch(/<main\b[^>]*\bid="main"/);
  });

  it('is where the route renders', () => {
    const html = shell(createElement('p', null, 'the page'));

    const [, inner] = /<main\b[^>]*>([\s\S]*)<\/main>/.exec(html) ?? [];

    expect(inner).toBe('<p>the page</p>');
  });
});

describe('the site footer', () => {
  it('prints the pinned copyright year', () => {
    const html = shell();

    expect(html).toContain(`© ${SITE_COPYRIGHT_YEAR} ${SITE_COPYRIGHT}`);
  });

  // The year is pinned rather than computed, so the page renders the same bytes
  // whenever it is built; a `new Date().getFullYear()` would satisfy the
  // assertion above every year but one, and drift a baseline on New Year's Day.
  it('reads no clock while rendering', () => {
    const dateSpy = vi.spyOn(globalThis, 'Date');

    shell();

    expect(dateSpy).not.toHaveBeenCalled();
    dateSpy.mockRestore();
  });

  it('links out to the feed and to the source', () => {
    const links = linksIn(shell());

    expect(links).toContainEqual({ href: '/rss.xml', text: 'RSS' });
    expect(links).toContainEqual({
      href: 'https://github.com/climaa',
      text: 'GitHub',
    });
  });

  it('links out to the design system', () => {
    const links = linksIn(shell());

    expect(links).toContainEqual({
      href: 'https://acceptance-gate-storybook.vercel.app',
      text: 'Storybook',
    });
  });

  // The console is the third published surface, and it sits beside Storybook
  // rather than anywhere else in the footer: static evidence, then the tool
  // that produced it. The order is asserted, not just the membership.
  it('links out to the visual-diff console, beside Storybook', () => {
    const links = linksIn(shell());

    const storybook = links.findIndex((link) => link.text === 'Storybook');
    expect(links[storybook + 1]).toEqual({
      href: 'https://acceptance-gate-visual-diff-ui.vercel.app',
      text: 'Visual diff',
    });
  });
});

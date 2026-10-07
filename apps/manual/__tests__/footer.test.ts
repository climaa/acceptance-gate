import { createElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RootLayout from '@/app/layout';
import manifest from '../package.json';

/**
 * The footer's version mark. Against the manifest, not a literal: a release bumps
 * the version and this must stay true without an edit.
 *
 * Plain text here, unlike the blog's: the manual has no release notes of its own
 * for the version to lead to.
 */
const footerText = () =>
  (
    renderToStaticMarkup(createElement(RootLayout, null, null)).match(
      /<footer\b[\s\S]*?<\/footer>/,
    )?.[0] ?? ''
  ).replace(/<[^>]*>/g, '');

describe('the footer', () => {
  // The text, not the markup: it is what a reader copying the line gets, and it
  // survives a class rename.
  it("ends the copyright line with this app's release", () => {
    expect(footerText()).toContain(`· v${manifest.version}`);
  });
});

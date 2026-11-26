// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import NotFound, { metadata } from '../app/not-found';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '../lib/site';

/**
 * The page every miss renders. Its reader followed a link the console drew —
 * most often to a report deleted since — so what matters is that it says so and
 * hands back a route; Next's built-in 404 offers neither.
 *
 * Assertions match the copy, not a status code: the proxy fails open, so the
 * same body can answer `200` (see the file's header).
 */

afterEach(() => {
  cleanup();
});

describe('app/not-found.tsx', () => {
  it('names the miss without blaming the address', () => {
    render(<NotFound />);

    expect(screen.getByText(NOT_FOUND_NOTE)).toBeDefined();
  });

  // The shell's wordmark is not a link, so this is the only way back.
  it('links back to the console root', () => {
    render(<NotFound />);

    const back = screen.getByRole('link', { name: NOT_FOUND_ACTION });

    expect(back.getAttribute('href')).toBe('/');
  });

  it('offers exactly one way on', () => {
    render(<NotFound />);

    const links = screen.getAllByRole('link');

    expect(links).toHaveLength(1);
  });

  // Same constraint as app/error.tsx: the e2e refusal locator reads
  // `getByRole('main').getByRole('alert')` strictly, so a miss must not add one.
  it('draws no alert', () => {
    render(<NotFound />);

    const alert = screen.queryByRole('alert');

    expect(alert).toBeNull();
  });

  it('titles the tab with the page heading', () => {
    const { title } = metadata;

    expect(title).toBe(NOT_FOUND_TITLE);
  });
});

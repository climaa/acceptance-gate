import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CensusFrame } from '@/components/CensusFrame';
import type { HomeFilter } from '@/lib/filter.ts';
import { homeView } from '@/lib/home.ts';
import { sample, SAMPLE_DAY } from './sample';

/**
 * What the root layout draws around every page: the shell, the measurement band
 * under its top bar, then the page. `renderToStaticMarkup` mounts no App Router,
 * so `next/navigation` answers for the home, the one route both frames read.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {} }),
}));

const measured = homeView(sample(), SAMPLE_DAY);
const PAGE = createElement('main', { id: 'page' });

/** The label of every pressed segment in the band, in DOM order. */
const pressed = (html: string) =>
  [...html.matchAll(/aria-pressed="true"[^>]*>(.*?)<\/button>/g)].map(
    ([, label]) => label,
  );

// Called rather than handed to `createElement`: it keeps no state of its own,
// and its props type requires the `children` lint wants kept out of props.
const frame = (view = measured, filter?: HomeFilter) =>
  renderToStaticMarkup(CensusFrame({ view, ...(filter && { filter }), children: PAGE }));

describe('the frame around a page', () => {
  it('draws the band inside the shell, between the top bar and the page', () => {
    // Arrange · Act
    const html = frame();

    // Assert
    const shell = html.indexOf('class="census-shell"');
    const band = html.indexOf('class="census-bar"');
    const page = html.indexOf('<main id="page">');
    expect(shell).toBeGreaterThanOrEqual(0);
    expect(band).toBeGreaterThan(shell);
    expect(page).toBeGreaterThan(band);
  });

  it('dates the measurement it was handed', () => {
    // Arrange
    if (measured.state !== 'measured') throw new Error('the sample is measured');

    // Act
    const html = frame();

    // Assert
    expect(html).toContain(`>${measured.meta.commit.short}</a>`);
  });

  it('names the measured repository in the sidebar brand', () => {
    // Arrange
    const local = { ...measured, repoName: 'landing-lab' };

    // Act
    const html = frame(local);

    // Assert
    expect(html).toContain('<span class="ds-sidebar__repository">landing-lab</span>');
  });

  it('filters nothing when no filter is passed', () => {
    // Arrange · Act
    const unfiltered = frame();

    // Assert
    // The wide dimension strip, the narrow one, then the category strip.
    expect(pressed(unfiltered)).toEqual(['All 57', 'All', 'All']);
    expect(unfiltered).toBe(frame(measured, { dimension: null, category: null }));
  });

  it('hands the filter it was given to the band', () => {
    // Arrange
    const filter: HomeFilter = { dimension: 'code', category: null };

    // Act
    const html = frame(measured, filter);

    // Assert
    expect(pressed(html)).toEqual(['Code 9', 'Code', 'All']);
  });

  it('keeps the band, empty, around the page when nothing is measured', () => {
    // Arrange
    const empty = homeView({ state: 'empty' }, SAMPLE_DAY);

    // Act
    const html = frame(empty);

    // Assert
    expect(html).toContain('<div class="census-bar"></div><main id="page"></main>');
  });
});

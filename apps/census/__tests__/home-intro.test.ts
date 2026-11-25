import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HomeScreen } from '@/components/HomeScreen';
import { homeView } from '@/lib/home.ts';
import { sample, SAMPLE_DAY } from './sample.ts';

const DAY = 86_400_000;

const home = (now: number) =>
  renderToStaticMarkup(
    createElement(HomeScreen, {
      view: homeView({ state: 'measured', ...sample() }, now),
    }),
  );

/** The markup inside the home's intro block, which nests no `<div>` of its own. */
const intro = (html: string) => {
  const start = html.indexOf('<div class="census-intro">');
  return html.slice(start, html.indexOf('</div>', start));
};

describe('the home intro', () => {
  it('holds the stale notice under the tools line, as the tile nests it', () => {
    // Arrange
    const now = SAMPLE_DAY + 21 * DAY;

    // Act
    const html = intro(home(now));

    // Assert
    expect(html).toMatch(/class="census-tools".*class="census-stale"/s);
  });

  it('ends at the tools line when the measurement is fresh', () => {
    // Arrange
    const now = SAMPLE_DAY;

    // Act
    const html = home(now);

    // Assert
    expect(html).not.toContain('census-stale');
  });
});

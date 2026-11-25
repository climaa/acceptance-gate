import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ManualFrame } from '@/components/ManualFrame';
import { inManual } from '../app/_screens/frame';

vi.mock('@/lib/version', () => ({ SITE_VERSION: '99.0.0' }));
vi.mock('../app/globals.css', () => ({}));

const Page = () => createElement('p', null, 'page');

describe('the version in the footer', () => {
  it('is the manifest version on the deployed page', () => {
    // Arrange
    const page = createElement(ManualFrame, null, createElement(Page));

    // Act
    const html = renderToStaticMarkup(page);

    // Assert
    expect(html).toContain('v99.0.0');
  });

  it('does not move with the manifest on a screen story', () => {
    // Arrange
    const [decorate] = inManual('/').decorators;

    // Act
    const html = renderToStaticMarkup(createElement(() => decorate!(Page)));

    // Assert
    expect(html).not.toContain('99.0.0');
    expect(html).toMatch(/v\d+\.\d+\.\d+/);
  });
});

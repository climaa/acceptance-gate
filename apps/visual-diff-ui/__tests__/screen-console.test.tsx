// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReporter } from '@gate/logger';
import { answerAsSample, inConsole } from '../app/_screens/console';

/**
 * What a screen story's page is drawn inside: the fetches its client components
 * make, answered as a sample instance answers them, and the frame and address
 * the page is drawn at.
 *
 * A screen's baseline is only as honest as these answers. A route the stub does
 * not know is a 404 the console's hooks absorb without a word, so the stub says
 * so on its own; and a file the static build serves beside the page must reach
 * that build, or the board pane photographs an empty frame.
 */

const realFetch = globalThis.fetch;
let restore: () => void = () => {};

beforeEach(() => {
  // A test run looks like `next dev` to the logger, so an error prints as well
  // as reports. Silenced; the reporter is what is asserted on.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  restore();
  globalThis.fetch = realFetch;
  cleanup();
  setReporter(() => {});
  vi.restoreAllMocks();
});

describe('answerAsSample', () => {
  it('answers a route the console polls with the sample instance’s answer', async () => {
    restore = answerAsSample();

    const response = await fetch('/api/jobs/current');

    expect(await response.json()).toMatchObject({ isSample: true, running: false });
  });

  it('sends a file the static build serves to the real fetch', async () => {
    const served = vi.fn(async () => new Response('{"scale":2}'));
    globalThis.fetch = served;
    restore = answerAsSample();

    await fetch('/designs/05-screens.json');

    expect(served).toHaveBeenCalledWith('/designs/05-screens.json', undefined);
  });

  it('answers a route it does not know 404, and says which', async () => {
    const report = vi.fn();
    setReporter(report);
    restore = answerAsSample();

    const response = await fetch('/api/reports');

    expect(response.status).toBe(404);
    expect(report).toHaveBeenCalledWith(
      'screen story: no sample answer for /api/reports',
    );
  });

  it('puts the real fetch back when the story unmounts', () => {
    const served = vi.fn();
    globalThis.fetch = served;

    answerAsSample()();

    expect(globalThis.fetch).toBe(served);
  });
});

describe('inConsole', () => {
  it('draws the page at its address, query included', () => {
    const story = inConsole('/report/r', { query: { bucket: 'changed' } });

    expect(story.parameters.nextjs.navigation).toEqual({
      pathname: '/report/r',
      query: { bucket: 'changed' },
    });
  });

  it('lets a page grow as tall as it is', () => {
    const [decorate] = inConsole('/').decorators;
    if (!decorate) throw new Error('inConsole draws no frame');

    render(decorate(() => <p>page</p>));

    expect(screen.getByText('page').closest('[style]')).toBeNull();
  });

  it('holds the page behind a modal to one window', () => {
    const [decorate] = inConsole('/set/s/shot/k', { overModal: true }).decorators;
    if (!decorate) throw new Error('inConsole draws no frame');

    render(decorate(() => <p>page</p>));

    const window = screen.getByText('page').closest<HTMLElement>('[style]');
    expect(window?.style.height).toBe('100vh');
    expect(window?.style.overflow).toBe('hidden');
  });
});

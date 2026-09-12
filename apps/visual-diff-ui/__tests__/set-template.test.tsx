// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { SetTemplate } from '../components/SetTemplate';
import type { CanonicalSet as Corpus } from '../lib/baselines';
import type { SetShot, SetShots } from '../lib/set-shots';
import { groupShots, parseShotName } from '../lib/set-shots';

/**
 * The set viewer, rendered from literal rows.
 *
 * The template is props-only and synchronous on purpose, so every branch it has
 * — corpus provenance, capture provenance, the ragged matrix, the unreadable
 * files note — is reachable here without a filesystem behind it.
 */

afterEach(cleanup);

const shot = (key: string): SetShot => {
  const cell = parseShotName(`${key}.png`);
  if (!cell) throw new Error(`not a variant key: ${key}`);

  return { ...cell, bytes: 10, width: 1248, height: 25 };
};

const shots = (keys: readonly string[], overrides: Partial<SetShots> = {}): SetShots => ({
  label: 'baselines',
  isCanonical: true,
  sections: groupShots(keys.map(shot)),
  shots: keys.length,
  bytes: 1_700_000,
  ignored: [],
  env: null,
  ...overrides,
});

const corpus: Corpus = {
  label: 'baselines',
  sha: 'd9d8e9612345',
  acceptedAt: '2026-08-30',
  stories: 160,
  bytes: 1_700_000,
};

const BADGE = 'atoms__desktop__light__atoms-badge--accent';
const HEADER = ['organisms__desktop__light__organisms-siteheader--default'];

describe('SetTemplate', () => {
  it('names the container the corpus was drawn in', () => {
    const set = shots([BADGE], {
      env: {
        image: 'mcr.microsoft.com/playwright:v1.62.1-noble',
        chromium: '151.0.7922.34',
      },
    });

    render(<SetTemplate corpus={corpus} set={null} shots={set} />);

    // The whole answer to "what did the container render, as opposed to what
    // does Storybook draw on this machine".
    expect(screen.getByText('mcr.microsoft.com/playwright:v1.62.1-noble')).toBeTruthy();
  });

  it('says a captured set records a checkout rather than a host', () => {
    const set = shots([BADGE], { label: 'main-2026-08-17', isCanonical: false });

    render(
      <SetTemplate
        corpus={null}
        set={{
          label: 'main-2026-08-17',
          sha: '5eb0b8b1234',
          branch: 'main',
          capturedAt: '2026-08-17',
          stories: 1,
          dirty: false,
        }}
        shots={set}
      />,
    );

    expect(screen.getByRole('note', { name: 'capture provenance' })).toBeTruthy();
  });

  /**
   * The one-alert rule. `apps/e2e` locates the console's refusal by
   * `role="alert"`, and a second one anywhere in `main` breaks that locator —
   * so a standing condition on this page is a note, never an alert.
   */
  it('raises no alert, because nothing here is a refusal', () => {
    render(<SetTemplate corpus={corpus} set={null} shots={shots([BADGE])} />);

    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('draws a tier section per tier that has stories, and none that does not', () => {
    const set = shots([BADGE, ...HEADER]);

    render(<SetTemplate corpus={corpus} set={null} shots={set} />);

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent),
    ).toEqual([expect.stringContaining('atoms'), expect.stringContaining('organisms')]);
  });

  it('shows a desktop-only story its two shots and no empty mobile frame', () => {
    const set = shots([BADGE, 'atoms__desktop__dark__atoms-badge--accent']);

    render(<SetTemplate corpus={corpus} set={null} shots={set} />);

    const story = screen.getByRole('article');
    expect(within(story).getAllByRole('img')).toHaveLength(2);
    expect(within(story).queryByText('mobile')).toBeNull();
  });

  /** Every shot reserves its own ratio and defers its own bytes: 160 images on
   *  one page is the ordinary case here, not the extreme one. */
  it('reserves each shot ratio and loads it lazily', () => {
    render(<SetTemplate corpus={corpus} set={null} shots={shots([BADGE])} />);

    const image = screen.getByRole('img');
    expect({
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      loading: image.getAttribute('loading'),
    }).toEqual({ width: '1248', height: '25', loading: 'lazy' });
  });

  it('offers the published Storybook for the shot own theme, in a new tab', () => {
    render(<SetTemplate corpus={corpus} set={null} shots={shots([BADGE])} />);

    const link = screen.getByRole('link', { name: 'baseline Storybook' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('href')).toContain('colorScheme:light');
  });

  it('names files that are in the directory but are not screenshots', () => {
    const set = shots([BADGE], { ignored: ['notes.txt'] });

    render(<SetTemplate corpus={corpus} set={null} shots={set} />);

    expect(screen.getByRole('note', { name: 'unreadable files' }).textContent).toContain(
      'notes.txt',
    );
  });
});

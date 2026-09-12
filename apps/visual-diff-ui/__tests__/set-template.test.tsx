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

  /** The same fallback `canonical-set.test.tsx` proves on the console's card:
   *  an instance outside a checkout has a corpus git cannot date, and the row
   *  says so rather than leaving the field blank. */
  it('shows a dash for a corpus git could not describe', () => {
    const set = shots([BADGE]);

    render(
      <SetTemplate
        corpus={{ ...corpus, sha: null, acceptedAt: null }}
        set={null}
        shots={set}
      />,
    );

    expect(screen.getAllByText('—')).toHaveLength(2);
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

/**
 * The pinned bar.
 *
 * What these can prove is the MARKUP — the radios exist, they are grouped, the
 * default is `both`, every cell is labelled for the selector. What they cannot
 * prove is the filtering, because it is `display: none` driven by `:has()` and
 * jsdom does not lay out. That half is a browser pass, and this file should not
 * pretend otherwise: appearance belongs to visual-diff, and no app page is ever
 * captured.
 */
describe('SetFilterBar', () => {
  const render4 = () =>
    render(<SetTemplate corpus={corpus} set={null} shots={shots([BADGE, ...HEADER])} />);

  it('groups each axis so a screen reader can name it', () => {
    render4();

    expect(screen.getByRole('group', { name: 'theme' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'viewport' })).toBeTruthy();
  });

  /** Both axes, because either one left narrowed would open the page already
   *  hiding screenshots without having been asked to. */
  it('starts on both for each axis, so the page opens unfiltered', () => {
    render4();

    expect(screen.getAllByRole('radio', { name: 'both', checked: true })).toHaveLength(2);
    // Not `auto`: opening already narrowed would hide half the screenshots
    // without having been asked, and on a phone it would hide 46 of 63 stories.
    expect(screen.getAllByRole('radio', { name: 'auto', checked: false })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(6);
  });

  it('offers a radio per choice on each axis', () => {
    render4();

    expect(screen.getAllByRole('radio').map((node) => node.getAttribute('id'))).toEqual([
      'vd-theme-auto',
      'vd-theme-both',
      'vd-theme-light',
      'vd-theme-dark',
      'vd-viewport-auto',
      'vd-viewport-both',
      'vd-viewport-desktop',
      'vd-viewport-mobile',
    ]);
  });

  /** CSS selects the checked input by id, so the ids are a contract between the
   *  component and the stylesheet rather than an implementation detail. */
  it('renders every cell of the count matrix, since CSS reveals one', () => {
    render4();

    expect(document.querySelectorAll('.vd-set__counts .vd-filtered')).toHaveLength(9);
  });

  /**
   * The jump links and the tier headings follow the filter too. A heading
   * claiming 37 stories over three of them is the page contradicting itself —
   * found in the browser, because no test here can see a CSS filter.
   */
  it('gives every figure that moves with the filter all nine answers', () => {
    render4();

    const figures = [...document.querySelectorAll('.vd-filtered')];
    expect(figures.every((node) => node.getAttribute('data-for'))).toBe(true);
    // One set of nine for the bar, and one for each tier's jump link and heading.
    expect(figures).toHaveLength(9 * (1 + 2 * 2));
  });

  it('labels each screenshot with the axes a filter selects on', () => {
    render4();

    const cell = document.querySelector('.vd-cell');
    expect({
      theme: cell?.getAttribute('data-shot-theme'),
      viewport: cell?.getAttribute('data-shot-viewport'),
    }).toEqual({ theme: 'light', viewport: 'desktop' });
  });

  /** `data-theme` would have been the obvious name and would have re-themed the
   *  cell: tokens.css remaps every colour role under a bare `[data-theme='dark']`. */
  it('does not mark a cell with the attribute that drives the app theme', () => {
    render4();

    expect(document.querySelector('.vd-cell[data-theme]')).toBeNull();
  });

  /** `position: sticky` is clipped by its own parent's box, so a bar inside the
   *  header would scroll away with it. */
  it('puts the bar outside the header, not within it', () => {
    render4();

    const header = screen.getByRole('region', { name: 'set' });
    expect(header.querySelector('.vd-set__bar')).toBeNull();
    expect(document.querySelector('.vd-set__bar')).toBeTruthy();
  });

  it('keeps the tier jump-nav, now inside the bar', () => {
    render4();

    const nav = screen.getByRole('navigation', { name: 'tiers' });
    expect(nav.querySelectorAll('a')).toHaveLength(2);
  });
});

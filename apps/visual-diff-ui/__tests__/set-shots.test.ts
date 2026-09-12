import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  filterCounts,
  groupShots,
  parseShotName,
  readSetShots,
  type SetShot,
} from '../lib/set-shots';

/**
 * What a screenshot set holds, read off its filenames and its PNG headers.
 *
 * The grouping is pure and is asserted from literal names: the ragged matrix,
 * the tier order and the story order are facts about the data, and putting a
 * filesystem behind them would only make the same assertions slower. The reader
 * is exercised against a real temporary directory, because the parts worth
 * proving there — a header that will not parse, a file that names no cell, a
 * label with no directory — are all things only a real read can produce.
 */

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Signature, chunk length, `IHDR`, width, height — the twenty-four bytes
 *  `pngSize` reads, and nothing after them. A real capture carries pixels too;
 *  nothing on this page reads them. */
function pngBytes(width: number, height: number): Uint8Array {
  const header = new Uint8Array(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.set([0, 0, 0, 13], 8);
  header.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(header.buffer).setUint32(16, width);
  new DataView(header.buffer).setUint32(20, height);

  return header;
}

function setDirWith(files: Record<string, Uint8Array | string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-set-'));
  temporaryDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'sets', 'main-2026-08-17'), { recursive: true });

  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, 'sets', 'main-2026-08-17', name), body);
  }

  return dir;
}

const shot = (key: string, extra: Partial<SetShot> = {}): SetShot => {
  const cell = parseShotName(`${key}.png`);
  if (!cell) throw new Error(`not a variant key: ${key}`);

  return { ...cell, bytes: 10, width: 1248, height: 25, ...extra };
};

describe('parseShotName', () => {
  it('reads a filename back as the cell it names', () => {
    const name = 'atoms__desktop__light__atoms-badge--accent.png';

    const cell = parseShotName(name);

    expect(cell).toMatchObject({
      key: 'atoms__desktop__light__atoms-badge--accent',
      file: name,
      tier: 'atoms',
      viewport: 'desktop',
      theme: 'light',
      storyId: 'atoms-badge--accent',
    });
  });

  it('reads a mobile atom, which the tier rule alone would not allow', () => {
    // `visual-diff:all-viewports` opts six stories past `TIER_VIEWPORTS`, and
    // this shot really is in the committed corpus. A parser that re-derived the
    // matrix from the tier would orphan it.
    const cell = parseShotName('atoms__mobile__dark__atoms-prose--default.png');

    expect(cell?.viewport).toBe('mobile');
  });

  it.each([
    ['a file that is not a PNG', 'BASELINE_ENV.json'],
    ['a name with too few segments', 'atoms__desktop__atoms-badge.png'],
    ['a tier outside the matrix', 'pages__desktop__light__x--y.png'],
    ['a viewport outside the matrix', 'atoms__watch__light__x--y.png'],
  ])('refuses %s', (_case, name) => {
    const cell = parseShotName(name);

    expect(cell).toBeNull();
  });
});

describe('groupShots', () => {
  it('groups a story and reports only the viewports it has', () => {
    const shots = [
      shot('atoms__desktop__light__atoms-badge--accent'),
      shot('atoms__desktop__dark__atoms-badge--accent'),
    ];

    const [section] = groupShots(shots);

    expect(section?.groups[0]).toMatchObject({
      storyId: 'atoms-badge--accent',
      viewports: ['desktop'],
    });
  });

  it('reports both viewports for a story captured at both', () => {
    const shots = [
      'desktop__light',
      'desktop__dark',
      'mobile__light',
      'mobile__dark',
    ].map((cell) => shot(`organisms__${cell}__organisms-siteheader--default`));

    const [section] = groupShots(shots);

    expect(section?.groups[0]?.viewports).toEqual(['desktop', 'mobile']);
  });

  it('orders cells desktop before mobile and light before dark', () => {
    const shots = [
      'mobile__dark',
      'desktop__dark',
      'mobile__light',
      'desktop__light',
    ].map((cell) => shot(`organisms__${cell}__organisms-siteheader--default`));

    const [section] = groupShots(shots);

    expect(
      section?.groups[0]?.shots.map((one) => `${one.viewport}/${one.theme}`),
    ).toEqual(['desktop/light', 'desktop/dark', 'mobile/light', 'mobile/dark']);
  });

  it('orders sections by tier, innermost first, and drops the empty ones', () => {
    const shots = [
      shot('templates__desktop__light__templates-posttemplate--default'),
      shot('atoms__desktop__light__atoms-badge--accent'),
    ];

    const sections = groupShots(shots);

    expect(sections.map((section) => section.tier)).toEqual(['atoms', 'templates']);
  });

  it('counts stories and screenshots apart', () => {
    const shots = [
      shot('atoms__desktop__light__atoms-badge--accent'),
      shot('atoms__desktop__dark__atoms-badge--accent'),
      shot('atoms__desktop__light__atoms-badge--danger'),
    ];

    const [section] = groupShots(shots);

    expect({ stories: section?.stories, shots: section?.shots }).toEqual({
      stories: 2,
      shots: 3,
    });
  });
});

describe('readSetShots', () => {
  it('reads a set, measuring each shot from its PNG header', async () => {
    const dir = setDirWith({
      'atoms__desktop__light__atoms-badge--accent.png': pngBytes(1248, 25),
    });

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect(shots?.sections[0]?.groups[0]?.shots[0]).toMatchObject({
      width: 1248,
      height: 25,
    });
  });

  it('names a file that is not a shot rather than dropping it silently', async () => {
    const dir = setDirWith({
      'atoms__desktop__light__atoms-badge--accent.png': pngBytes(1248, 25),
      'notes.txt': 'left here by a human',
    });

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect(shots?.ignored).toEqual(['notes.txt']);
  });

  it('treats BASELINE_ENV.json as the stamp it is, not as an unreadable file', async () => {
    const dir = setDirWith({
      'atoms__desktop__light__atoms-badge--accent.png': pngBytes(1248, 25),
      'BASELINE_ENV.json': JSON.stringify({ platform: 'linux', chromium: '151' }),
    });

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect({ ignored: shots?.ignored, env: shots?.env }).toEqual({
      ignored: [],
      env: { platform: 'linux', chromium: '151' },
    });
  });

  it('reports null dimensions for a shot whose header will not parse', async () => {
    // A corrupt file is a shot to draw as broken, never a page to take down.
    const dir = setDirWith({
      'atoms__desktop__light__atoms-badge--accent.png': 'not a png at all',
    });

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect(shots?.sections[0]?.groups[0]?.shots[0]).toMatchObject({
      width: null,
      height: null,
    });
  });

  /**
   * There and unreadable is not the same as gone. A directory standing where a
   * screenshot should be `stat`s fine and refuses to be read, which is the
   * shape of a truncated capture or a half-written file — the shot is still on
   * disk, so it is still counted and still drawn, with no size in its caption.
   */
  it('still shows a shot that is on disk but will not answer', async () => {
    const dir = setDirWith({});
    fs.mkdirSync(
      path.join(
        dir,
        'sets',
        'main-2026-08-17',
        'atoms__desktop__light__atoms-badge--accent.png',
      ),
    );

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect({
      count: shots?.shots,
      first: shots?.sections[0]?.groups[0]?.shots[0],
    }).toMatchObject({
      count: 1,
      first: { width: null, height: null },
    });
  });

  /** Gone between the listing and the read, which a broken symlink reproduces
   *  exactly. Nothing to show, so nothing is claimed — and it is not named as an
   *  unreadable file either, because it named a cell perfectly well. */
  it('drops a shot whose file is no longer there, without counting it', async () => {
    const dir = setDirWith({
      'atoms__desktop__light__atoms-badge--accent.png': pngBytes(1248, 25),
    });
    fs.symlinkSync(
      path.join(dir, 'sets', 'main-2026-08-17', 'nothing-here.png'),
      path.join(
        dir,
        'sets',
        'main-2026-08-17',
        'atoms__desktop__dark__atoms-badge--accent.png',
      ),
    );

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect({ count: shots?.shots, ignored: shots?.ignored }).toEqual({
      count: 1,
      ignored: [],
    });
  });

  it('answers null for a label this instance holds no directory for', async () => {
    const dir = setDirWith({});

    const shots = await readSetShots(dir, null, 'never-captured');

    expect(shots).toBeNull();
  });

  it('answers null for the corpus when there is no checkout behind it', async () => {
    const dir = setDirWith({});

    const shots = await readSetShots(dir, null, 'baselines');

    expect(shots).toBeNull();
  });

  it('answers null for a directory holding no shots at all', async () => {
    const dir = setDirWith({ 'notes.txt': 'nothing but this' });

    const shots = await readSetShots(dir, null, 'main-2026-08-17');

    expect(shots).toBeNull();
  });
});

/**
 * The nine answers the bar renders and CSS reveals one of.
 *
 * Precomputed because `:checked` can hide a screenshot but cannot count what is
 * left, so the alternative was a client island on a page that deliberately has
 * none.
 */
describe('filterCounts', () => {
  const corpus = groupShots([
    // Desktop-only, both themes — 37 of the corpus's atoms look like this.
    shot('atoms__desktop__light__atoms-badge--accent'),
    shot('atoms__desktop__dark__atoms-badge--accent'),
    // All four cells — only 17 of 63 stories have a mobile screenshot.
    shot('organisms__desktop__light__organisms-siteheader--default'),
    shot('organisms__desktop__dark__organisms-siteheader--default'),
    shot('organisms__mobile__light__organisms-siteheader--default'),
    shot('organisms__mobile__dark__organisms-siteheader--default'),
  ]);

  it('counts everything when neither axis is narrowed', () => {
    const counts = filterCounts(corpus);

    expect(counts['both|both']).toEqual({ shots: 6, stories: 2 });
  });

  it('halves the screenshots but keeps every story when a theme is chosen', () => {
    const counts = filterCounts(corpus);

    expect(counts['dark|both']).toEqual({ shots: 3, stories: 2 });
  });

  /** The case the count exists for: a viewport filter drops whole stories, and a
   *  page saying "2 stories" while showing one would be worse than saying
   *  nothing. */
  it('drops a story a viewport filter leaves with nothing', () => {
    const counts = filterCounts(corpus);

    expect(counts['both|mobile']).toEqual({ shots: 2, stories: 1 });
  });

  it('narrows on both axes at once', () => {
    const counts = filterCounts(corpus);

    expect(counts['light|mobile']).toEqual({ shots: 1, stories: 1 });
  });

  it('answers every cell of the matrix, so no choice renders a gap', () => {
    const counts = filterCounts(corpus);

    expect(Object.keys(counts)).toHaveLength(9);
  });
});

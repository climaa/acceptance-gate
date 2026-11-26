import { join, resolve } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

/**
 * Draws a board's tiles from the rendered stories: renders each planned light
 * variant in light and dark, writes `<key>.svg` and `place.js`, and optionally
 * pixel-compares a light preview of each SVG with its baseline (`--preview`), or
 * matches Pen's exported PNGs to the baselines they differ from least (`--verify`).
 *
 * The script does all of it at import, with no exports, so each test imports it
 * fresh with `node:fs` reading and writing an in-memory disk, the browser and the
 * static server faked, and the PNG reader and differ replaced by a byte compare:
 * a fake PNG is a 24-byte header with its width and height where a real one has
 * them, then one byte per pixel. Nothing launches Chromium or touches the disk.
 * The SVG drawing itself (`tiles-from-dom/svg.mjs`) has its own suite.
 */
const ROOT = resolve(__dirname, '..', '..');
const TEMPLATE = join(ROOT, 'scripts/pen/place-tiles.js');
const DEFAULT_BASELINES = join(ROOT, 'packages/visual-diff/__baselines__');

type Variant = {
  id: string;
  key: string;
  tier: string;
  theme: 'light' | 'dark';
  viewport: 'desktop' | 'mobile';
  fullPage: boolean;
};

const m = vi.hoisted(() => {
  const disk = new Map<string, string | Buffer>();
  const shots: Buffer[] = [];
  const extractPage = vi.fn();
  const routed: string[] = [];
  const page = {
    url: '',
    goto: vi.fn(async (url: string) => {
      page.url = url;
    }),
    addStyleTag: vi.fn(),
    waitForFunction: vi.fn(async () => undefined),
    evaluate: vi.fn(async (fn: unknown, arg?: unknown) =>
      fn === extractPage ? extractPage(page.url, arg) : undefined,
    ),
    setViewportSize: vi.fn(),
    screenshot: vi.fn(async () => shots.shift()),
  };
  const context = {
    addInitScript: vi.fn(),
    route: vi.fn(async (_glob: string, handler: (route: unknown) => unknown) => {
      for (const url of ['http://127.0.0.1:6006/main.js', 'https://cdn.example/x.js'])
        handler({
          request: () => ({ url: () => url }),
          continue: () => routed.push(`continue ${url}`),
          abort: () => routed.push(`abort ${url}`),
        });
    }),
    newPage: vi.fn(async () => page),
    close: vi.fn(),
  };
  const browser = {
    newContext: vi.fn(async (_options: unknown) => context),
    newPage: vi.fn(async () => page),
    close: vi.fn(),
  };
  const server = { port: 6006, close: vi.fn() };
  return {
    disk,
    shots,
    routed,
    page,
    context,
    browser,
    server,
    extractPage,
    variants: [] as Variant[],
    readIndex: vi.fn((text: string) => JSON.parse(text)),
    createStaticServer: vi.fn(() => ({ listen: async () => server })),
    renderTile: vi.fn(),
    pairThemes: vi.fn((light: unknown[], dark: unknown[]) => ({ light, dark })),
    lightPreview: vi.fn((svg: string) => svg),
    palette: [{ light: '#fff', dark: '#000' }],
  };
});

vi.mock('node:fs', () => ({
  existsSync: (path: string) => m.disk.has(path),
  mkdirSync: vi.fn(),
  readFileSync: (path: string, encoding?: string) => {
    const data = m.disk.get(path);
    if (data === undefined) throw new Error(`ENOENT: ${path}`);

    return encoding ? String(data) : Buffer.from(data);
  },
  readdirSync: (dir: string) =>
    [...m.disk.keys()]
      .filter((path) => path.startsWith(`${dir}/`))
      .map((path) => path.slice(dir.length + 1)),
  writeFileSync: (path: string, data: string | Buffer) => m.disk.set(path, data),
}));

vi.mock('node:module', () => ({
  createRequire: () => (id: string) => {
    if (id === 'pngjs')
      return {
        PNG: {
          sync: {
            read: (png: Buffer) => ({
              width: png.readUInt32BE(16),
              height: png.readUInt32BE(20),
              data: png.subarray(24),
            }),
          },
        },
      };
    if (id === 'pixelmatch')
      return (a: Buffer, b: Buffer) => a.filter((byte, i) => byte !== b[i]).length;
    throw new Error(`unexpected require ${id}`);
  },
}));

vi.mock('../../packages/visual-diff/src/determinism.mjs', () => ({
  buildInitScript: () => 'init-script',
  FREEZE_CSS: 'freeze-css',
  PINNED_TIMEZONE: 'UTC',
  RENDER_PHASE_EXPRESSION: 'rendered',
}));

vi.mock('../../packages/visual-diff/src/capture.mjs', () => ({
  isLoopbackUrl: (url: string) => url.startsWith('http://127.0.0.1'),
  launchBrowser: async () => m.browser,
}));

vi.mock('../../packages/visual-diff/src/policy.mjs', () => ({
  CAPTURE_TARGET: '#storybook-root',
  COLOR_SCHEME_GLOBAL: 'theme',
  DETERMINISM: { deviceScaleFactor: 1 },
  VIEWPORTS: {
    desktop: { width: 1280, height: 800 },
    mobile: { width: 390, height: 844 },
  },
}));

vi.mock('../../packages/visual-diff/src/static-server.mjs', () => ({
  createStaticServer: m.createStaticServer,
}));

vi.mock('../../packages/visual-diff/src/storybook-index.mjs', () => ({
  readIndex: m.readIndex,
  planCaptures: () => ({ variants: m.variants }),
}));

vi.mock('../pen/tiles-from-dom/extract-page.mjs', () => ({
  extractPage: m.extractPage,
}));

vi.mock('../pen/tiles-from-dom/svg.mjs', () => ({
  createTables: () => ({ palette: m.palette, styles: { body: 'Inter' } }),
  lightPreview: m.lightPreview,
  pairThemes: m.pairThemes,
  renderTile: m.renderTile,
}));

const SCRIPT = '../pen/tiles-from-dom.mjs';

/** A fake PNG: real width and height offsets, then one byte per pixel. */
const png = (width: number, height: number, pixels: number[] = []) => {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  const body = Buffer.alloc(width * height);
  pixels.forEach((value, i) => (body[i] = value));

  return Buffer.concat([header, body]);
};

const variant = (over: Partial<Variant> & { key: string }): Variant => ({
  id: over.key.split('__').at(-1) ?? over.key,
  tier: 'templates',
  theme: 'light',
  viewport: 'desktop',
  fullPage: true,
  ...over,
});

const HOME = variant({
  key: 'templates__desktop__light__home',
  id: 'templates-home--default',
});
const HOME_MOBILE = variant({
  key: 'templates__mobile__light__home',
  id: 'templates-home--default',
  viewport: 'mobile',
});
const HOME_DARK = variant({
  key: 'templates__desktop__dark__home',
  id: 'templates-home--default',
  theme: 'dark',
});
const BADGE = variant({ key: 'atoms__desktop__light__badge', tier: 'atoms' });

describe('tiles-from-dom', () => {
  const argv = process.argv;
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;
  let exit: MockInstance<typeof process.exit>;

  const run = async (...args: string[]) => {
    process.argv = [...argv.slice(0, 1), 'tiles-from-dom.mjs', ...args];
    vi.resetModules();
    // A variable specifier: the script ships no types, and it is run here, not called.
    await import(/* @vite-ignore */ SCRIPT);
  };

  const logged = () => log.mock.calls.map((call) => call.join(' '));

  beforeEach(() => {
    m.disk.clear();
    m.shots.length = 0;
    m.routed.length = 0;
    m.variants = [HOME, HOME_MOBILE, HOME_DARK, BADGE];
    m.disk.set('/sb/index.json', '{"entries":{}}');
    m.disk.set(TEMPLATE, '/* place-tiles */');
    m.extractPage.mockImplementation((url: string) => ({
      size: [1279.4, 799.2],
      ops: url.endsWith('theme:dark') ? ['night'] : ['paper', 'ink'],
    }));
    m.renderTile.mockImplementation(({ key }: { key: string }) => ({
      svg: `<svg width="2" height="1" data-key="${key}"/>`,
      undrawn: [],
    }));
    vi.clearAllMocks();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  describe('usage', () => {
    it('exits 2 with its usage when --out is missing, before launching a browser', async () => {
      // Arrange
      const args = ['--static', '/sb'];

      // Act
      const running = run(...args);

      // Assert
      await expect(running).rejects.toThrow('exit 2');
      expect(exit).toHaveBeenCalledWith(2);
      expect(error.mock.calls[0]?.[0]).toMatch(
        /^usage: node scripts\/pen\/tiles-from-dom\.mjs --static/,
      );
      expect(m.createStaticServer).not.toHaveBeenCalled();
    });

    it('exits 2 when --static is missing', async () => {
      // Arrange
      const args = ['--out', '/out'];

      // Act
      const running = run(...args);

      // Assert
      await expect(running).rejects.toThrow('exit 2');
      expect(m.createStaticServer).not.toHaveBeenCalled();
    });
  });

  describe('drawing', () => {
    it('writes one SVG per light variant, and none for a dark one', async () => {
      // Arrange
      const args = ['--static', '/sb', '--out', '/out', '--baselines', '/base'];

      // Act
      await run(...args);

      // Assert
      const svgs = [...m.disk.keys()].filter((path) => path.endsWith('.svg'));
      expect(svgs.sort()).toEqual([
        `/out/${BADGE.key}.svg`,
        `/out/${HOME.key}.svg`,
        `/out/${HOME_MOBILE.key}.svg`,
      ]);
      expect(m.readIndex).toHaveBeenCalledWith('{"entries":{}}');
    });

    it('keeps only the variants of --tier whose key contains --filter', async () => {
      // Arrange
      const args = ['--static', '/sb', '--out', '/out', '--tier', 'templates'];
      const filter = ['--filter', 'mobile'];

      // Act
      await run(...args, ...filter);

      // Assert
      const svgs = [...m.disk.keys()].filter((path) => path.endsWith('.svg'));
      expect(svgs).toEqual([`/out/${HOME_MOBILE.key}.svg`]);
    });

    it('renders each variant in light then dark through its story URL and pairs them', async () => {
      // Arrange
      m.variants = [HOME];

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      const base = 'http://127.0.0.1:6006/iframe.html?id=templates-home--default';
      expect(m.page.goto.mock.calls.map(([url]) => url)).toEqual([
        `${base}&globals=theme:light`,
        `${base}&globals=theme:dark`,
      ]);
      expect(m.extractPage).toHaveBeenCalledWith(expect.any(String), {
        fullPage: true,
        target: '#storybook-root',
      });
      expect(m.pairThemes).toHaveBeenCalledWith(['paper', 'ink'], ['night']);
    });

    it('lays each viewport out in its own frozen context that only reaches the loopback', async () => {
      // Arrange
      m.variants = [HOME, HOME_MOBILE];

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      expect(m.browser.newContext.mock.calls.map(([options]) => options)).toEqual([
        expect.objectContaining({
          viewport: { width: 1280, height: 800 },
          timezoneId: 'UTC',
        }),
        expect.objectContaining({
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        }),
      ]);
      expect(m.context.addInitScript).toHaveBeenCalledWith('init-script');
      expect(m.routed).toEqual([
        'continue http://127.0.0.1:6006/main.js',
        'abort https://cdn.example/x.js',
        'continue http://127.0.0.1:6006/main.js',
        'abort https://cdn.example/x.js',
      ]);
      expect(m.context.close).toHaveBeenCalledTimes(2);
    });

    it('draws a tile at its baseline size when the variant has one', async () => {
      // Arrange
      m.variants = [HOME];
      m.disk.set(`/base/${HOME.key}.png`, png(1280, 801));

      // Act
      await run('--static', '/sb', '--out', '/out', '--baselines', '/base');

      // Assert
      expect(m.renderTile).toHaveBeenCalledWith(
        expect.objectContaining({ key: HOME.key, size: [1280, 801] }),
      );
    });

    it('rounds the measured box outward when the variant has no baseline yet', async () => {
      // Arrange
      m.variants = [HOME];

      // Act
      await run('--static', '/sb', '--out', '/out', '--baselines', '/base');

      // Assert
      expect(m.renderTile).toHaveBeenCalledWith(
        expect.objectContaining({ size: [1280, 800] }),
      );
    });

    it('looks for baselines in the visual-diff package by default', async () => {
      // Arrange
      m.variants = [HOME];
      m.disk.set(join(DEFAULT_BASELINES, `${HOME.key}.png`), png(640, 400));

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      expect(m.renderTile).toHaveBeenCalledWith(
        expect.objectContaining({ size: [640, 400] }),
      );
    });

    it('names the operations a tile could not draw', async () => {
      // Arrange
      m.variants = [HOME];
      m.renderTile.mockReturnValue({ svg: '<svg/>', undrawn: ['canvas', 'video'] });

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      expect(logged()).toContain(`${HOME.key}  2 operations  NOT DRAWN: canvas, video`);
    });

    it('writes place.js as the snippet with the palette and output dir in front', async () => {
      // Arrange
      m.variants = [HOME];

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      const data = { palette: m.palette, styles: { body: 'Inter' } };
      expect(m.disk.get('/out/place.js')).toBe(
        `const DATA = ${JSON.stringify(data)};\nconst OUT = "/out/pen";\n/* place-tiles */`,
      );
      expect(JSON.parse(String(m.disk.get('/out/palette.json')))).toEqual(data);
      expect(logged().at(-1)).toBe('1 tiles, 1 colour pairs → /out');
    });

    it('closes the browser and the server when a render fails', async () => {
      // Arrange
      m.variants = [HOME];
      m.extractPage.mockImplementation(() => {
        throw new Error('page crashed');
      });

      // Act
      const running = run('--static', '/sb', '--out', '/out');

      // Assert
      await expect(running).rejects.toThrow('page crashed');
      expect(m.browser.close).toHaveBeenCalled();
      expect(m.server.close).toHaveBeenCalled();
    });

    it('carries on when the story never reports it rendered', async () => {
      // Arrange
      m.variants = [HOME];
      m.page.waitForFunction.mockRejectedValueOnce(new Error('timeout'));

      // Act
      await run('--static', '/sb', '--out', '/out');

      // Assert
      expect(m.disk.has(`/out/${HOME.key}.svg`)).toBe(true);
    });
  });

  describe('--preview', () => {
    const preview = (...extra: string[]) =>
      run(
        '--static',
        '/sb',
        '--out',
        '/out',
        '--baselines',
        '/base',
        '--preview',
        ...extra,
      );

    beforeEach(() => {
      m.variants = [HOME];
      m.disk.set(`/base/${HOME.key}.png`, png(2, 1, [7, 7]));
    });

    it('screenshots the light preview at the SVG size and passes a tile within the limit', async () => {
      // Arrange
      m.shots.push(png(2, 1, [7, 7]));

      // Act
      await preview();

      // Assert
      expect(m.lightPreview).toHaveBeenCalledWith(
        expect.stringContaining(HOME.key),
        m.palette,
      );
      expect(m.page.setViewportSize).toHaveBeenCalledWith({ width: 2, height: 1 });
      expect(m.disk.get(`/out/${HOME.key}.preview.png`)).toEqual(png(2, 1, [7, 7]));
      expect(logged()).toContain(`0.00%  ${HOME.key}`);
      expect(logged().at(-1)).toBe('worst tile 0.00% (limit 3%)');
      expect(process.exitCode).toBeUndefined();
    });

    it('fails the run when a tile differs by more than --max-diff', async () => {
      // Arrange
      m.shots.push(png(2, 1, [7, 9]));

      // Act
      await preview('--max-diff', '10');

      // Assert
      expect(logged()).toContain(`50.00%  ${HOME.key}`);
      expect(logged().at(-1)).toBe('worst tile 50.00% (limit 10%)');
      expect(process.exitCode).toBe(1);
    });

    it('fails the run when the preview and its baseline differ in size', async () => {
      // Arrange
      m.shots.push(png(3, 1));

      // Act
      await preview();

      // Assert
      expect(logged()).toContain(`SIZE 3x1 vs baseline 2x1  ${HOME.key}`);
      expect(process.exitCode).toBe(1);
    });

    it('caps the preview viewport at 16000 pixels tall', async () => {
      // Arrange
      m.renderTile.mockReturnValue({
        svg: '<svg width="2" height="20000"/>',
        undrawn: [],
      });
      m.shots.push(png(2, 1, [7, 7]));

      // Act
      await preview();

      // Assert
      expect(m.page.setViewportSize).toHaveBeenCalledWith({ width: 2, height: 16000 });
    });
  });

  describe('--verify', () => {
    const LIGHT = HOME.key;
    const DARK = HOME_DARK.key;

    beforeEach(() => {
      m.disk.set(`/out/${LIGHT}.svg`, '<svg/>');
      m.disk.set('/out/place.js', '');
      m.disk.set(`/base/${LIGHT}.png`, png(2, 2, [1, 1, 1, 1]));
      m.disk.set(`/base/${DARK}.png`, png(2, 2, [9, 9, 9, 9]));
    });

    const verify = () => run('--verify', '/pen', '--out', '/out', '--baselines', '/base');

    it('names each export by the baseline of its size it differs from least, light or dark', async () => {
      // Arrange
      m.disk.set('/pen/node-1.png', png(2, 2, [9, 9, 9, 1]));
      m.disk.set('/pen/node-2.png', png(2, 2, [1, 1, 1, 1]));

      // Act
      await verify();

      // Assert
      expect(logged()).toEqual([
        `25.00%  ${DARK}  (node-1.png)`,
        `0.00%  ${LIGHT}  (node-2.png)`,
      ]);
      expect(m.createStaticServer).not.toHaveBeenCalled();
    });

    it('says so when no baseline has the export size, and skips non-PNG files', async () => {
      // Arrange
      m.disk.set('/pen/node-3.png', png(5, 5));
      m.disk.set('/pen/notes.txt', 'not an export');

      // Act
      await verify();

      // Assert
      expect(logged()).toEqual(['NO BASELINE OF THIS SIZE  node-3.png']);
    });
  });
});

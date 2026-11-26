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
 * The second half of a board export: reads the manifests export-boards.js prints,
 * renames each `<node id>.png` Pencil wrote to its board's stem, writes the
 * `<stem>.json` and `<stem>.tiles.json` sidecars off the PNG's real size, and
 * deletes the exports of boards whose `.pen` is gone.
 *
 * The script does all of that at import, with no exports, so each test imports it
 * fresh with `node:fs` replaced by an in-memory disk holding `designs/` and its
 * `exports/`. Nothing touches the real tree.
 */
const { disk } = vi.hoisted(() => ({ disk: new Map<string, string | Buffer>() }));

vi.mock('node:fs', () => ({
  existsSync: (path: string) => disk.has(path),
  readFileSync: (path: string, encoding?: string) => {
    const data = disk.get(path);
    if (data === undefined) throw new Error(`ENOENT: ${path}`);

    return encoding ? String(data) : Buffer.from(data);
  },
  writeFileSync: (path: string, data: string) => void disk.set(path, data),
  renameSync: (from: string, to: string) => {
    const data = disk.get(from);
    if (data === undefined) throw new Error(`ENOENT: ${from}`);
    disk.delete(from);
    disk.set(to, data);
  },
  rmSync: (path: string) => void disk.delete(path),
  readdirSync: (dir: string) =>
    [...disk.keys()]
      .filter((path) => path.startsWith(`${dir}/`))
      .map((path) => path.slice(dir.length + 1))
      .filter((name) => !name.includes('/')),
}));

const SCRIPT = '../pen/finish-export.mjs';
const DESIGNS = resolve(__dirname, '..', '..', 'designs');
const EXPORTS = join(DESIGNS, 'exports');
const exported = (name: string) => join(EXPORTS, name);

/** Just enough PNG for the script: its IHDR width and height at bytes 16–23. */
function png(width: number, height: number) {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);

  return bytes;
}

type Entry = {
  id: string;
  stem: string;
  board: string;
  width: number;
  height: number;
  scale: number;
  tiles: Record<string, number[]>;
};

const ATOMS: Entry = {
  id: 'nodeA',
  stem: '01-atoms',
  board: '01-atoms — Atoms',
  width: 1000,
  height: 2000,
  scale: 2,
  tiles: {
    atoms__desktop__light__badge: [10, 20, 30, 40],
    atoms__desktop__dark__badge: [110, 20, 30, 40],
  },
};

/** A board file with its `.pen` and the PNG Pencil exported under its node id. */
function board(
  entry: Entry,
  size = png(entry.width * entry.scale, entry.height * entry.scale),
) {
  disk.set(join(DESIGNS, `${entry.stem}.pen`), '');
  disk.set(exported(`${entry.id}.png`), size);
}

const manifestFile = (name: string, entries: Entry[], prefix = 'MANIFEST ') => {
  const path = `/manifests/${name}.txt`;
  disk.set(path, `${prefix}${JSON.stringify(entries)}\n`);

  return path;
};

const readJson = (name: string) => JSON.parse(String(disk.get(exported(name))));

describe('finish-export', () => {
  const argv = process.argv;
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;
  let exit: MockInstance<typeof process.exit>;

  const stdout = () => log.mock.calls.map(([line]) => String(line)).join('\n');

  const run = async (...files: string[]) => {
    process.argv = [...argv.slice(0, 1), 'finish-export.mjs', ...files];
    vi.resetModules();
    // A variable specifier: the script ships no types, and it is run here, not called.
    await import(/* @vite-ignore */ SCRIPT);
  };

  beforeEach(() => {
    disk.clear();
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
  });

  it('exits 2 with its usage when given no manifest', async () => {
    await expect(run()).rejects.toThrow('exit 2');

    expect(exit).toHaveBeenCalledWith(2);
    expect(error).toHaveBeenCalledWith(
      'usage: node scripts/pen/finish-export.mjs <manifest file>…',
    );
  });

  describe('a board exported at the scale asked for', () => {
    beforeEach(() => board(ATOMS));

    it("renames the node id's PNG to the board's stem", async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(disk.has(exported('nodeA.png'))).toBe(false);
      expect(disk.get(exported('01-atoms.png'))).toEqual(png(2000, 4000));
    });

    it('writes the size sidecar with the stated size and scale', async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(readJson('01-atoms.json')).toEqual({
        board: '01-atoms — Atoms',
        width: 1000,
        height: 2000,
        scale: 2,
      });
      expect(stdout()).not.toContain('came back at scale');
    });

    it('writes the tile map one tile to a line, in key order', async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(String(disk.get(exported('01-atoms.tiles.json')))).toBe(
        [
          '{',
          '  "board": "01-atoms — Atoms",',
          '  "scale": 2,',
          '  "tiles": {',
          '    "atoms__desktop__dark__badge": [110, 20, 30, 40],',
          '    "atoms__desktop__light__badge": [10, 20, 30, 40]',
          '  }',
          '}',
          '',
        ].join('\n'),
      );
    });

    it('takes a PNG a pixel off the stated size as written at the stated scale', async () => {
      board(ATOMS, png(2001, 3999));

      await run(manifestFile('atoms', [ATOMS]));

      expect(readJson('01-atoms.json')).toMatchObject({ height: 2000, scale: 2 });
    });

    it('reports how many boards it wrote', async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(stdout()).toContain('1 boards written to designs/exports/');
    });
  });

  describe('a board Pencil capped below the scale asked for', () => {
    // Asked for 2000×4000; Pencil drew more than the box and capped the long side,
    // so the PNG came back 1500 wide and 3300 tall.
    beforeEach(() => board(ATOMS, png(1500, 3300)));

    it("takes the scale off the PNG's width and the height off that scale", async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(readJson('01-atoms.json')).toEqual({
        board: '01-atoms — Atoms',
        width: 1000,
        height: 2200,
        scale: 1.5,
      });
      expect(stdout()).toContain(
        '01-atoms.png came back at scale 1.5, not 2: sidecars say so',
      );
    });

    it("rescales every tile into the PNG's pixels", async () => {
      await run(manifestFile('atoms', [ATOMS]));

      expect(readJson('01-atoms.tiles.json')).toEqual({
        board: '01-atoms — Atoms',
        scale: 1.5,
        tiles: {
          atoms__desktop__dark__badge: [83, 15, 23, 30],
          atoms__desktop__light__badge: [8, 15, 23, 30],
        },
      });
    });
  });

  describe('a board with no tiles', () => {
    const FOUNDATIONS: Entry = {
      ...ATOMS,
      id: 'nodeF',
      stem: '00-foundations',
      board: '00-foundations — Foundations',
      tiles: {},
    };

    it('writes no tile map', async () => {
      board(FOUNDATIONS);

      await run(manifestFile('foundations', [FOUNDATIONS]));

      expect(disk.has(exported('00-foundations.json'))).toBe(true);
      expect(disk.has(exported('00-foundations.tiles.json'))).toBe(false);
    });

    it('deletes the tile map an earlier export left', async () => {
      board(FOUNDATIONS);
      disk.set(exported('00-foundations.tiles.json'), '{}');

      await run(manifestFile('foundations', [FOUNDATIONS]));

      expect(disk.has(exported('00-foundations.tiles.json'))).toBe(false);
    });
  });

  describe('manifest files', () => {
    const SCRATCH: Entry = {
      ...ATOMS,
      id: 'nodeX',
      stem: 'x-scratch',
      board: 'x-scratch',
    };

    it('reads every file, with or without the MANIFEST prefix', async () => {
      board(ATOMS);
      board(SCRATCH);

      await run(manifestFile('atoms', [ATOMS]), manifestFile('scratch', [SCRATCH], ''));

      expect(disk.has(exported('01-atoms.json'))).toBe(true);
      expect(disk.has(exported('x-scratch.json'))).toBe(true);
      expect(stdout()).toContain('2 boards written to designs/exports/');
    });

    it('fails on a manifest that is not JSON, before touching exports/', async () => {
      board(ATOMS);
      disk.set('/manifests/bad.txt', 'MANIFEST not json');

      await expect(run('/manifests/bad.txt')).rejects.toThrow(SyntaxError);

      expect(disk.has(exported('nodeA.png'))).toBe(true);
    });
  });

  describe('exports of a board whose .pen is gone', () => {
    beforeEach(() => board(ATOMS));

    it('deletes the PNG and both sidecars, and says so', async () => {
      for (const name of ['04-gone.png', '04-gone.json', '04-gone.tiles.json']) {
        disk.set(exported(name), '');
      }

      await run(manifestFile('atoms', [ATOMS]));

      expect(disk.has(exported('04-gone.png'))).toBe(false);
      expect(disk.has(exported('04-gone.json'))).toBe(false);
      expect(disk.has(exported('04-gone.tiles.json'))).toBe(false);
      expect(stdout()).toContain(
        'removed 04-gone.tiles.json: there is no designs/04-gone.pen',
      );
    });

    it('deletes a scratch board export the same way', async () => {
      disk.set(exported('x-old.png'), '');

      await run(manifestFile('atoms', [ATOMS]));

      expect(disk.has(exported('x-old.png'))).toBe(false);
    });

    it('keeps the exports of boards whose .pen exists', async () => {
      disk.set(join(DESIGNS, '02-molecules.pen'), '');
      disk.set(exported('02-molecules.png'), '');

      await run(manifestFile('atoms', [ATOMS]));

      expect(disk.has(exported('02-molecules.png'))).toBe(true);
      expect(disk.has(exported('01-atoms.png'))).toBe(true);
    });

    it('leaves files not named like a board export alone', async () => {
      for (const name of [
        'home-page.png',
        'social-card.png',
        '04-gone.webp',
        'README.md',
      ]) {
        disk.set(exported(name), '');
      }

      await run(manifestFile('atoms', [ATOMS]));

      for (const name of [
        'home-page.png',
        'social-card.png',
        '04-gone.webp',
        'README.md',
      ]) {
        expect(disk.has(exported(name))).toBe(true);
      }
      expect(stdout()).not.toContain('removed');
    });
  });
});

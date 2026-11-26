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
 * Pastes tile SVGs into the active Pen document: each file goes to the clipboard
 * through `pbcopy`, then an AppleScript escapes twice and sends ⌘V to Pen.
 *
 * The script does that at import, with no exports, so each test imports it fresh
 * with `node:fs` reading from an in-memory disk and `node:child_process` recording
 * the commands instead of running them. Nothing touches the clipboard or Pen, and
 * `process.platform` is set per test, so the suite runs the same on Linux CI.
 */
const { disk, exec } = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  exec: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: (path: string) => {
    const data = disk.get(path);
    if (data === undefined) throw new Error(`ENOENT: ${path}`);

    return Buffer.from(data);
  },
}));

vi.mock('node:child_process', () => ({ execFileSync: exec }));

const SCRIPT = '../pen/paste-tiles.mjs';
const BADGE = '/tiles/atoms__badge.svg';
const BUTTON = '/tiles/atoms__button.svg';

describe('paste-tiles', () => {
  const argv = process.argv;
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;
  let exit: MockInstance<typeof process.exit>;

  const setPlatform = (value: NodeJS.Platform) =>
    Object.defineProperty(process, 'platform', { ...platform, value });

  const run = async (...files: string[]) => {
    process.argv = [...argv.slice(0, 1), 'paste-tiles.mjs', ...files];
    vi.resetModules();
    // A variable specifier: the script ships no types, and it is run here, not called.
    await import(/* @vite-ignore */ SCRIPT);
  };

  /** The commands run, in order, each as its program and the input or script it got. */
  const commands = () =>
    exec.mock.calls.map(([program, args]) =>
      program === 'pbcopy'
        ? ['pbcopy', String(args.input)]
        : [program, ...(args as string[])],
    );

  beforeEach(() => {
    disk.clear();
    exec.mockReset();
    setPlatform('darwin');
    disk.set(BADGE, '<svg id="badge"/>');
    disk.set(BUTTON, '<svg id="button"/>');
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
  });

  afterEach(() => {
    process.argv = argv;
    Object.defineProperty(process, 'platform', platform);
    vi.restoreAllMocks();
  });

  it('exits 2 off macOS, before touching the clipboard', async () => {
    setPlatform('linux');

    await expect(run(BADGE)).rejects.toThrow('exit 2');

    expect(exit).toHaveBeenCalledWith(2);
    expect(error).toHaveBeenCalledWith(
      'paste-tiles.mjs drives Pen through AppleScript, so it runs on macOS only',
    );
    expect(exec).not.toHaveBeenCalled();
  });

  it('exits 2 with its usage when given no SVG', async () => {
    await expect(run()).rejects.toThrow('exit 2');

    expect(exit).toHaveBeenCalledWith(2);
    expect(error).toHaveBeenCalledWith('usage: node scripts/pen/paste-tiles.mjs <svg>…');
    expect(exec).not.toHaveBeenCalled();
  });

  it("copies each SVG's contents, then pastes it, one file at a time in order", async () => {
    await run(BADGE, BUTTON);

    expect(commands().map(([program, input]) => [program, input.slice(0, 18)])).toEqual([
      ['pbcopy', '<svg id="badge"/>'],
      ['osascript', '-e'],
      ['pbcopy', '<svg id="button"/>'],
      ['osascript', '-e'],
    ]);
  });

  it('activates Pen, escapes twice, then sends ⌘V', async () => {
    await run(BADGE);

    const script = String(exec.mock.calls[1]?.[1]?.[1]);
    const activate = script.indexOf('tell application "Pen" to activate');
    const escapes = [...script.matchAll(/key code 53/g)].map((match) => match.index);
    const paste = script.indexOf('keystroke "v" using command down');

    expect(activate).toBeGreaterThanOrEqual(0);
    expect(escapes).toHaveLength(2);
    expect(escapes.every((index) => index > activate && index < paste)).toBe(true);
  });

  it('reports each file it pasted', async () => {
    await run(BADGE, BUTTON);

    expect(log.mock.calls).toEqual([
      ['pasted', BADGE],
      ['pasted', BUTTON],
    ]);
  });

  it('stops at an SVG it cannot read, after pasting the ones before it', async () => {
    await expect(run(BADGE, '/tiles/missing.svg', BUTTON)).rejects.toThrow(
      'ENOENT: /tiles/missing.svg',
    );

    expect(log.mock.calls).toEqual([['pasted', BADGE]]);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

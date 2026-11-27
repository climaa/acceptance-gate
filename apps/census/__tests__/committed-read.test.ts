import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseCommitted, readCommitted } from '@/lib/committed.ts';
import { FEATURE_MAP } from '@/lib/features.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');
const text = (name: 'measurement' | 'history') =>
  readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8');

describe('parseCommitted', () => {
  it('is empty when no measurement is committed', () => {
    const committed = parseCommitted({ measurement: null, history: null });

    expect(committed).toEqual({ state: 'empty' });
  });

  it('is the measurement and its history when both validate', () => {
    const committed = parseCommitted({
      measurement: text('measurement'),
      history: text('history'),
    });

    expect(committed.state).toBe('measured');
  });

  it('fails on a measurement that does not validate, naming the file and the path', () => {
    const broken = { ...JSON.parse(text('measurement')), commit: 'aebf7ec' };

    const parse = () =>
      parseCommitted({ measurement: JSON.stringify(broken), history: text('history') });

    expect(parse).toThrow(/measurement\.json: commit: /);
  });

  it('fails on a history that does not validate', () => {
    const parse = () =>
      parseCommitted({ measurement: text('measurement'), history: '{"schema":2}' });

    expect(parse).toThrow(/history\.json: schema: /);
  });

  it('fails on a file that is not JSON', () => {
    const parse = () => parseCommitted({ measurement: '{', history: text('history') });

    expect(parse).toThrow(/measurement\.json: not JSON/);
  });

  it('fails on a measurement committed without its history', () => {
    const parse = () =>
      parseCommitted({ measurement: text('measurement'), history: null });

    expect(parse).toThrow(/history\.json: missing beside measurement\.json/);
  });

  it('fails on a history committed without a measurement', () => {
    const parse = () => parseCommitted({ measurement: null, history: text('history') });

    expect(parse).toThrow(/measurement\.json: missing beside history\.json/);
  });

  it('lists every problem in one message', () => {
    const parse = () => parseCommitted({ measurement: '{', history: '{' });

    expect(parse).toThrow(/measurement\.json: not JSON[\s\S]*history\.json: not JSON/);
  });
});

describe('readCommitted', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reads an app directory with nothing committed as empty', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'census-'));

    const committed = readCommitted(dir);

    expect(committed).toEqual({ state: 'empty' });
  });

  it('reads both committed files from the app directory', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'census-'));
    writeFileSync(path.join(dir, 'measurement.json'), text('measurement'));
    writeFileSync(path.join(dir, 'history.json'), text('history'));

    const committed = readCommitted(dir, undefined);

    expect(committed).toMatchObject({
      state: 'measured',
      source: 'committed',
      map: FEATURE_MAP,
    });
  });

  it('reads the app directory when CENSUS_DATA_DIR is set but empty', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'census-'));
    writeFileSync(path.join(dir, 'measurement.json'), text('measurement'));
    writeFileSync(path.join(dir, 'history.json'), text('history'));

    const committed = readCommitted(dir, '');

    expect(committed).toMatchObject({ state: 'measured', source: 'committed' });
  });

  it('fails on a committed file it cannot read, rather than calling it absent', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'census-'));
    mkdirSync(path.join(dir, 'measurement.json'));

    const read = () => readCommitted(dir as string);

    expect(read).toThrow(/EISDIR/);
  });
});

/** A child's checkout, as `census.config.json` names it: its blog is `web`. */
const childConfig = (visits: string) => ({
  repo: 'climaa/landing-lab',
  storybook: 'apps/storybook',
  sharedVitestConfig: null,
  pseudoWorkspaces: [],
  apps: { web: visits, storybook: 'apps/storybook' },
  features: Object.fromEntries(
    ['a11y', 'about', 'blog', 'changelog-comments', 'link-preview', 'smoke'].map((f) => [
      f,
      'web',
    ]),
  ),
  localFeatures: [],
});

describe('readCommitted from CENSUS_DATA_DIR', () => {
  let app: string | undefined;
  let data: string | undefined;
  afterEach(() => {
    for (const d of [app, data]) if (d) rmSync(d, { recursive: true, force: true });
    app = data = undefined;
  });

  const setUp = (config: string | null) => {
    app = mkdtempSync(path.join(tmpdir(), 'census-app-'));
    data = mkdtempSync(path.join(tmpdir(), 'census-data-'));
    const measurement = {
      ...JSON.parse(text('measurement')),
      repo: 'climaa/landing-lab',
    };
    writeFileSync(path.join(data, 'measurement.json'), JSON.stringify(measurement));
    writeFileSync(path.join(data, 'history.json'), text('history'));
    if (config !== null) writeFileSync(path.join(data, 'census.config.json'), config);
    return { app, data };
  };

  it('reads the files there, not the app directory, as a local measurement', () => {
    const { app, data } = setUp(null);

    const committed = readCommitted(app, data);

    expect(committed).toMatchObject({
      state: 'measured',
      source: 'local',
      measurement: { repo: 'climaa/landing-lab' },
    });
  });

  it('judges the measurement by the census.config.json beside it', () => {
    const { app, data } = setUp(JSON.stringify(childConfig('apps/blog')));

    const committed = readCommitted(app, data);

    expect(committed).toMatchObject({
      state: 'measured',
      map: { apps: { web: 'apps/blog', storybook: 'apps/storybook' }, localFeatures: [] },
    });
  });

  it("fails a measurement that the beside config's map refuses", () => {
    const { app, data } = setUp(JSON.stringify(childConfig('apps/web')));

    const read = () => readCommitted(app, data);

    expect(read).toThrow(/measurement\.json: .*smoke visits apps\/web, not apps\/blog/);
  });

  it('fails on a config that is not JSON, naming the file', () => {
    const { app, data } = setUp('{');

    const read = () => readCommitted(app, data);

    expect(read).toThrow(/census\.config\.json: not JSON/);
  });

  it('fails on a config of the wrong shape, naming the file and the path', () => {
    const { app, data } = setUp(
      JSON.stringify({ ...childConfig('apps/blog'), repo: 'x' }),
    );

    const read = () => readCommitted(app, data);

    expect(read).toThrow(/census\.config\.json: repo: expected owner\/name/);
  });

  it('names the file once for a problem at the root of the config', () => {
    const { app, data } = setUp('[]');

    const read = () => readCommitted(app, data);

    expect(read).toThrow(/census\.config\.json: (?!census\.config\.json)/);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { parseCommitted, readCommitted } from '@/lib/committed.ts';

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

    const committed = readCommitted(dir);

    expect(committed.state).toBe('measured');
  });

  it('fails on a committed file it cannot read, rather than calling it absent', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'census-'));
    mkdirSync(path.join(dir, 'measurement.json'));

    const read = () => readCommitted(dir as string);

    expect(read).toThrow(/EISDIR/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger, setReporter, type Reporter } from './index';

const spyConsole = () => ({
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
  info: vi.spyOn(console, 'info').mockImplementation(() => {}),
});

const REPORTER_KEY = Symbol.for('@gate/logger.reporter');

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { [key: symbol]: Reporter | undefined })[REPORTER_KEY];
});

describe('createLogger', () => {
  it('prints all three levels in development mode', () => {
    const spies = spyConsole();
    const log = createLogger(undefined, 'development');
    log.error('e');
    log.warn('w');
    log.info('i');
    expect(spies.error).toHaveBeenCalledWith('e');
    expect(spies.warn).toHaveBeenCalledWith('w');
    expect(spies.info).toHaveBeenCalledWith('i');
  });

  it('prints nothing in production mode', () => {
    const spies = spyConsole();
    const log = createLogger(undefined, 'production');
    log.error('e');
    log.warn('w');
    log.info('i');
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
  });

  it('error() still forwards args to the reporter in production; warn/info do not', () => {
    spyConsole();
    const report = vi.fn();
    const log = createLogger(report, 'production');
    const failure = new Error('boom');
    log.error('context', failure);
    log.warn('w');
    log.info('i');
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('context', failure);
  });

  it('default reporter does not throw', () => {
    spyConsole();
    const log = createLogger(undefined, 'development');
    expect(() => log.error('e')).not.toThrow();
  });
});

describe('logger singleton', () => {
  it('setReporter(spy) makes logger.error reach the spy', () => {
    spyConsole();
    const spy = vi.fn();
    setReporter(spy);
    logger.error('x');
    expect(spy).toHaveBeenCalledWith('x');
  });
});

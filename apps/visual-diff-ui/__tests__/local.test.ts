// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { isLocalHost } from '../lib/local';

/**
 * The local gate, as a truth table.
 *
 * It decides whether this console may start a job at all, and it is asked twice
 * over — once by the page that draws the panel, once by `POST /api/jobs`. A
 * table is the whole of what there is to say about it, which is why the e2e
 * suite does not try: all three of its worlds are on localhost by construction.
 */

describe('isLocalHost', () => {
  it.each([
    ['localhost:3300', 'the console a reviewer runs'],
    ['localhost', 'a host header with no port'],
    ['127.0.0.1:3200', 'the seeded e2e world'],
    ['[::1]:3300', 'IPv6, bracketed the way RFC 7230 requires'],
    ['::1', 'IPv6 from a client that did not bracket it'],
    ['LOCALHOST:3300', 'a host header that shouted'],
  ])('reads %s as local — %s', (host) => {
    expect(isLocalHost(host)).toBe(true);
  });

  it.each([
    ['acceptance-gate-visual-diff-ui.vercel.app', 'the deployment'],
    ['localhost.evil.com', 'a domain that merely starts with the word'],
    ['evil.com:3300', 'the right port on the wrong machine'],
    ['', 'a header that carried nothing'],
  ])('reads %s as remote — %s', (host) => {
    expect(isLocalHost(host)).toBe(false);
  });

  // Fail closed. A request this console could not read a host from is not
  // evidence that it came from this machine, and the cost of guessing wrong is a
  // deployment that runs jobs.
  it('reads a missing host as remote', () => {
    expect(isLocalHost(null)).toBe(false);
    expect(isLocalHost(undefined)).toBe(false);
  });
});

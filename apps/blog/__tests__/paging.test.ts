// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  blogPagePath,
  laterPages,
  pageCount,
  pageOf,
  parseLaterPage,
  POSTS_PER_PAGE,
} from '../lib/paging';

/**
 * The arithmetic every paged surface shares — the two routes, the sitemap and
 * the proxy all read these — pinned here once so a wrong page set shows up as a
 * wrong number rather than as a 404 somewhere downstream.
 */

describe('lib/paging', () => {
  // The number the board rules on. Named in the test so a change to it is a
  // change someone meant.
  it('cuts the index four posts to a page', () => {
    expect(POSTS_PER_PAGE).toBe(4);
  });

  it('counts pages, and never fewer than one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(4)).toBe(1);
    expect(pageCount(5)).toBe(2);
    expect(pageCount(9)).toBe(3);
  });

  it('slices the page asked for, short on the last one', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

    expect(pageOf(items, 1)).toEqual(['a', 'b', 'c', 'd']);
    expect(pageOf(items, 3)).toEqual(['i']);
    expect(pageOf(items, 4)).toEqual([]);
  });

  it('addresses page 1 as /blog and the rest under /blog/page', () => {
    expect(blogPagePath(1)).toBe('/blog');
    expect(blogPagePath(2)).toBe('/blog/page/2');
  });

  it('lists the later pages only, which is none for a single page', () => {
    expect(laterPages(4)).toEqual([]);
    expect(laterPages(9)).toEqual([2, 3]);
  });

  describe('parseLaterPage', () => {
    it('accepts the canonical spelling of an existing later page', () => {
      expect(parseLaterPage('2', 9)).toBe(2);
      expect(parseLaterPage('3', 9)).toBe(3);
    });

    it('refuses page 1, which has its own address', () => {
      expect(parseLaterPage('1', 9)).toBeNull();
    });

    it('refuses a page past the last', () => {
      expect(parseLaterPage('4', 9)).toBeNull();
    });

    // The spellings a sitemap never writes: one page, one address.
    it('refuses anything but a plain positive integer', () => {
      for (const param of ['0', '02', '2.0', '-2', 'two', '', '2abc', '1e1']) {
        expect(parseLaterPage(param, 9)).toBeNull();
      }
    });
  });
});

// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  comparisonHref,
  comparisonPath,
  isComparisonPath,
  parseComparisonPath,
  reportPath,
} from '../lib/comparison';

/**
 * A comparison's address. Every reader of it — the report's compare buttons,
 * the modal's arrows, the copy-link button, the proxy's redirect and the page's
 * own `<head>` — builds it here, so the link a reviewer copies is the link the
 * proxy accepts.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';

describe('comparisonPath', () => {
  it('nests the variant key under its report', () => {
    const at = comparisonPath(REPORT, KEY);

    expect(at).toBe(`/report/${REPORT}/compare/${KEY}`);
  });

  // A key is `[a-z0-9-]` and `__` today, but the path is built from whatever it
  // is handed: a character the URL grammar reserves must not split the segment.
  it('encodes each segment, so neither can spill into the next', () => {
    const at = comparisonPath('a/b', 'c?d');

    expect(at).toBe('/report/a%2Fb/compare/c%3Fd');
  });
});

describe('comparisonHref', () => {
  it('leaves the default mode out, so a comparison has one bare link', () => {
    const href = comparisonHref(REPORT, KEY, 'diff');

    expect(href).toBe(comparisonPath(REPORT, KEY));
  });

  it('carries any other mode in the query string', () => {
    const href = comparisonHref(REPORT, KEY, 'slider');

    expect(href).toBe(`${comparisonPath(REPORT, KEY)}?mode=slider`);
  });

  // `actual size` is the one mode with a space in it.
  it('encodes a mode with a space in it', () => {
    const href = comparisonHref(REPORT, KEY, 'actual size');

    expect(href).toBe(`${comparisonPath(REPORT, KEY)}?mode=actual+size`);
  });

  it('is the bare path when no mode is given', () => {
    const href = comparisonHref(REPORT, KEY);

    expect(href).toBe(comparisonPath(REPORT, KEY));
  });
});

describe('reportPath', () => {
  it('is where a comparison closes to', () => {
    const at = reportPath(REPORT);

    expect(at).toBe(`/report/${REPORT}`);
  });
});

describe('isComparisonPath', () => {
  it('recognises a comparison', () => {
    const answer = isComparisonPath(comparisonPath(REPORT, KEY));

    expect(answer).toBe(true);
  });

  it('does not mistake the report itself for one', () => {
    const answer = isComparisonPath(reportPath(REPORT));

    expect(answer).toBe(false);
  });

  it('refuses a path with anything after the key', () => {
    const answer = isComparisonPath(`${comparisonPath(REPORT, KEY)}/opengraph-image`);

    expect(answer).toBe(false);
  });
});

describe('parseComparisonPath', () => {
  it('reads back exactly what comparisonPath wrote', () => {
    const parsed = parseComparisonPath(comparisonPath(REPORT, KEY));

    expect(parsed).toEqual({ reportId: REPORT, key: KEY });
  });

  // The proxy, the modal and the report must agree on this round trip for
  // any input, including the characters the URL grammar reserves.
  it('round-trips segments carrying reserved characters', () => {
    const parsed = parseComparisonPath(comparisonPath('a/b', 'c?d'));

    expect(parsed).toEqual({ reportId: 'a/b', key: 'c?d' });
  });

  it('is null for a segment that will not decode, rather than throwing', () => {
    const parsed = parseComparisonPath(`/report/${REPORT}/compare/%`);

    expect(parsed).toBeNull();
  });

  it('is null for the report itself', () => {
    const parsed = parseComparisonPath(reportPath(REPORT));

    expect(parsed).toBeNull();
  });

  it('is null for an empty key', () => {
    const parsed = parseComparisonPath(`/report/${REPORT}/compare/`);

    expect(parsed).toBeNull();
  });
});

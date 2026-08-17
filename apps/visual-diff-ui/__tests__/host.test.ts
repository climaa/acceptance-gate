import { HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { hostFingerprint, hostMatches } from '../lib/host';

/**
 * The app-side half of D3: whether this machine may write baselines.
 *
 * The CLI's own guard reads `BASELINE_ENV.json` and compares four fields; this
 * one asks a narrower question — "is the process serving this console the
 * pinned container?" — and answers it from the one field a process can be told
 * about itself. `accept` bare-metal has no host guard at all, so this is the
 * only thing standing between a host-rendered baseline and the corpus.
 */

const PINNED = HOST.image;

describe('hostFingerprint', () => {
  it('reports no image when nothing declares one', () => {
    const fingerprint = hostFingerprint({});

    expect(fingerprint.image).toBeNull();
  });

  it('reports the declared image and the Playwright version in its tag', () => {
    const fingerprint = hostFingerprint({ VISUAL_DIFF_FAKE_HOST_FINGERPRINT: PINNED });

    expect(fingerprint).toMatchObject({ image: PINNED, playwright: '1.62.1' });
  });
});

describe('hostMatches', () => {
  it('matches the pinned image', () => {
    const fingerprint = hostFingerprint({ VISUAL_DIFF_FAKE_HOST_FINGERPRINT: PINNED });

    expect(hostMatches(fingerprint)).toBe(true);
  });

  it('refuses an image that is not the pinned one', () => {
    const fingerprint = hostFingerprint({
      VISUAL_DIFF_FAKE_HOST_FINGERPRINT: 'mcr.microsoft.com/playwright:v1.61.0-noble',
    });

    expect(hostMatches(fingerprint)).toBe(false);
  });

  it('refuses a host that declares no image at all', () => {
    // The bare-metal case, and the whole reason the gate exists: a process
    // cannot see its own image, so silence must never read as agreement.
    const fingerprint = hostFingerprint({});

    expect(hostMatches(fingerprint)).toBe(false);
  });

  it('refuses a declared image that merely contains the pinned name', () => {
    const fingerprint = hostFingerprint({
      VISUAL_DIFF_FAKE_HOST_FINGERPRINT: `${PINNED}-local-patch`,
    });

    expect(hostMatches(fingerprint)).toBe(false);
  });
});

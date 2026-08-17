/**
 * What the machine serving this console can say about itself, in the four
 * fields `packages/visual-diff`'s policy compares before a capture is
 * considered comparable to the committed baselines (`HOST.comparedKeys`).
 *
 * It exists this early because the accept gate is the one place the console
 * refuses to act — baselines are only acceptable from the pinned container —
 * and a seam bolted on later is a seam the e2e worlds cannot drive.
 */

import { HOST } from '@gate/visual-diff/policy';

/** The one variable this endpoint reads, named as a type for the same reason
 *  `DataDirEnv` is: the env surface of this app is two variables, both declared. */
export interface HostEnv {
  VISUAL_DIFF_FAKE_HOST_FINGERPRINT?: string;
  /** See `DataDirEnv`: the index signature is what admits `process.env` itself. */
  [variable: string]: string | undefined;
}

export interface HostFingerprint {
  platform: string;
  arch: string;
  /**
   * `null` unless declared. A process cannot see the image it runs in, and
   * guessing would be the one wrong answer here: an unfounded match is what
   * would let baselines be accepted from a host that never captured them.
   */
  image: string | null;
  /** Read off the image tag — policy pins the image and the library together. */
  playwright: string | null;
}

/** `mcr.microsoft.com/playwright:v1.62.1-noble` → `1.62.1`. */
const IMAGE_TAG = /playwright:v(\d+\.\d+\.\d+)/;

function playwrightFrom(image: string | null): string | null {
  if (!image) return null;

  return IMAGE_TAG.exec(image)?.[1] ?? null;
}

/**
 * `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` names the image this host claims to be.
 * Nothing else feeds `image`, so a test world drives the accept gate's whole
 * decision — matching, mismatching, or absent — from that one variable, and a
 * deployment that declares nothing is reported as the non-capture host it is.
 */
export function hostFingerprint(env: HostEnv = process.env): HostFingerprint {
  const image = env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT?.trim() || null;

  return {
    platform: process.platform,
    arch: process.arch,
    image,
    playwright: playwrightFrom(image),
  };
}

/**
 * Whether this host may write baselines — the accept gate's whole question.
 *
 * Equality against `HOST.image`, and only that field. `platform` and `arch` are
 * deliberately not compared: the pinned image runs on both architectures this
 * repo captures from, so holding them to a value would refuse a legitimate
 * container, and `playwright` is read back off the same tag `image` carries,
 * so comparing it twice would only assert the parse. An absent image is a
 * refusal, never a pass — see {@link HostFingerprint.image}.
 */
export function hostMatches(fingerprint: HostFingerprint = hostFingerprint()): boolean {
  return fingerprint.image === HOST.image;
}

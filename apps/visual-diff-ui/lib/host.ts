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
import type { RunnerEnv } from './api-contract';
import { dockerAvailable } from './docker';

/** The one variable this endpoint reads, named as a type for the same reason
 *  `DataDirEnv` is: the env surface of this app is two variables, both declared. */
export interface HostEnv {
  VISUAL_DIFF_FAKE_HOST_FINGERPRINT?: string;
  /** See `DataDirEnv`: the index signature is what admits `process.env` itself. */
  [variable: string]: string | undefined;
}

/**
 * The four keys `HOST.comparedKeys` names, which is `RunnerEnv` minus the one
 * field that is not a fingerprint — see {@link runnerEnv} for why `docker` rides
 * alongside rather than in here.
 *
 * Derived rather than declared, because the shape is the wire shape:
 * `RunnerEnvSchema` in lib/api-contract.ts is what `GET /api/env` answers with
 * and what the run panel parses that answer against, and a second declaration
 * here would be free to disagree with it. The per-field prose lives on the
 * schema for the same reason.
 */
export type HostFingerprint = Omit<RunnerEnv, 'docker'>;

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
 * What `GET /api/env` answers with: the fingerprint, and whether a container
 * could be started right now.
 *
 * `docker` is deliberately NOT a fingerprint field. {@link HostFingerprint} is
 * the four keys `HOST.comparedKeys` names, and `summaryEnv` writes every one of
 * them into a report's `env` record as a string — a fifth, boolean field there
 * is a report that fails its own schema. It rides alongside instead.
 *
 * Only asked when this host is not already the pinned image: a console running
 * inside the container has none to start, and the probe is a subprocess this
 * endpoint would otherwise pay for on every poll to answer a question nothing
 * reads.
 */
export function runnerEnv(env: HostEnv = process.env): RunnerEnv {
  const fingerprint = hostFingerprint(env);

  return {
    ...fingerprint,
    docker: hostMatches(fingerprint) ? false : dockerAvailable(env),
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
 * refusal, never a pass — see `RunnerEnvSchema.image` in lib/api-contract.ts.
 */
export function hostMatches(fingerprint: HostFingerprint = hostFingerprint()): boolean {
  return fingerprint.image === HOST.image;
}

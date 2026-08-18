import { connection } from 'next/server';
import { hostFingerprint } from '@/lib/host';

/**
 * The host this console runs on, as the accept gate will compare it.
 *
 * `connection()` first: every field is read from the running process, all of it
 * synchronously, so without it the answer resolves during `next build` and the
 * deployed route would serve the build machine's fingerprint forever — with
 * `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` read at a moment no test can reach.
 *
 * `no-store` for the same reason at the other end: a fingerprint is a claim
 * about right now, and a cached one is a claim about a machine that answered.
 */
export async function GET(): Promise<Response> {
  await connection();

  return Response.json(hostFingerprint(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

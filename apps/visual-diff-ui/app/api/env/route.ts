import { connection } from 'next/server';
import type { RunnerEnv } from '@/lib/api-contract';
import { runnerEnv } from '@/lib/host';

/**
 * The host this console runs on, as the accept gate will compare it — plus
 * whether it could borrow the pinned container, which is what the capture modes
 * need and the accept gate does not.
 *
 * `connection()` first: every field is read from the running process, all of it
 * synchronously, so without it the answer resolves during `next build` and the
 * deployed route would serve the build machine's fingerprint forever — with
 * `VISUAL_DIFF_FAKE_HOST_FINGERPRINT` read at a moment no test can reach.
 *
 * `no-store` for the same reason at the other end: a fingerprint is a claim
 * about right now, and a cached one is a claim about a machine that answered.
 *
 * The payload is `RunnerEnv` because `runnerEnv()` returns exactly that type,
 * and that type is `z.infer` of the schema the run panel parses this answer
 * against — the two halves are one declaration rather than two that agree. See
 * lib/api-contract.ts.
 */
export async function GET(): Promise<Response> {
  await connection();

  const body: RunnerEnv = runnerEnv();

  return Response.json(body, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

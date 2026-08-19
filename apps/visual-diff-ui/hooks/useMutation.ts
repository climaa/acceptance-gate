'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The one lifecycle every mutation on this console runs.
 *
 * Three call sites wrote it out longhand — `DeleteSetButton`, `PruneButton` and
 * the run panel's `useStartJob` — and all three ran the same seven steps in the
 * same order: mark busy, clear the last refusal, POST or DELETE with
 * `cache: 'no-store'`, read the server's prose off a non-ok response, re-read
 * the page on success because every table around them is server-rendered, fall
 * back to `UNREACHABLE` when the request never landed, and clear busy whatever
 * happened. `fallow dupes` had it as a clone group at 53 tokens, which is the
 * part a token comparison can see; the shape is the rest.
 *
 * What the hook deliberately does not know is what any of it means. The URL, the
 * method, the body and the sentence to fall back on all arrive as arguments, so
 * nothing here learns what a snapshot set or a job is. What each caller does
 * *after* a success is also theirs — closing a dialog, reading a partial refusal
 * out of the body — which is why `run` hands the parsed body back rather than
 * growing a callback for each variation.
 */

/** What a mutation this console could not reach at all comes back as. Not the
 *  server's words, because there were none — and saying so is better than an
 *  empty dialog that looks like it worked. */
export const UNREACHABLE =
  'the console could not reach the job API — is the server still up?';

/**
 * The sentence a refused mutation answered with.
 *
 * Every refusal in this app carries prose in `error` (lib/refusals.ts owns the
 * copy). A response that carries none is a failure nobody wrote a sentence for,
 * and the fallback names the action rather than the status, since "500" is not
 * something a reviewer can do anything with either.
 */
export async function refusalOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // A refusal that is not JSON is still a refusal.
  }

  return fallback;
}

export interface MutationRequest {
  url: string;
  method: 'POST' | 'DELETE';
  /** JSON-encoded when present; the content-type rides with it. */
  body?: unknown;
  /** What to say if the server refused without prose. Names the action. */
  fallback: string;
}

/** A success carries the parsed body so the caller can read a partial refusal
 *  out of it; a refusal carries nothing, the sentence being on the hook. */
export type MutationResult = { ok: true; body: unknown } | { ok: false };

export interface Mutation {
  run: (request: MutationRequest) => Promise<MutationResult>;
  /** Zero, one, or — after a partial prune — several. */
  refusals: readonly string[];
  busy: boolean;
  clear: () => void;
  /** For refusals the caller reads out of a 200: a prune that skipped a held
   *  set answered ok and still has something to say. */
  refuse: (sentences: readonly string[]) => void;
}

export function useMutation(): Mutation {
  const router = useRouter();
  const [refusals, setRefusals] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async ({
    url,
    method,
    body,
    fallback,
  }: MutationRequest): Promise<MutationResult> => {
    setBusy(true);
    setRefusals([]);

    try {
      const response = await fetch(url, {
        method,
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
      });

      if (!response.ok) {
        setRefusals([await refusalOf(response, fallback)]);
        return { ok: false };
      }

      // Every table this console mutates is server-rendered, so the row that
      // just changed only changes on screen once the page is read again.
      router.refresh();

      return { ok: true, body: await response.json().catch(() => ({})) };
    } catch {
      setRefusals([UNREACHABLE]);
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  return { run, refusals, busy, clear: () => setRefusals([]), refuse: setRefusals };
}

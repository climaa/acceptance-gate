'use client';

import { useEffect, useState } from 'react';

/**
 * The one lifecycle every read this console does on mount runs.
 *
 * `useRunnerFingerprint` and `useStories` wrote it out longhand inside RunPanel,
 * and both ran the same six steps in the same order: hold a `live` flag, fetch
 * with `cache: 'no-store'`, parse, set state only if the component is still
 * mounted, fall back to a stated value when the request never landed, and clear
 * the flag on cleanup. The differences were a URL, how to read the body, and what
 * to say when there was no body — which is exactly the argument list below.
 *
 * The write half of this console has had one lifecycle since `useMutation` was
 * extracted from three copies. This is the read half, and it is deliberately the
 * same shape of thing: it knows a URL and nothing about what lives there.
 *
 * NOT the poller. `CurrentJob` fetches `/api/jobs/current` on an interval with
 * backoff and an unchanged-answer dedupe, and folding that in here would mean one
 * hook with a mode switch rather than two hooks with one job each. It is also not
 * `useLabelSuggestion`, which fires on a press rather than on mount.
 *
 * `no-store` on every read, as the panel already did. These endpoints report what
 * is true of the machine right now — which image is running, whether Docker is up,
 * what the Storybook build holds — and a cached answer to any of them is a console
 * describing a state that has moved on.
 */
export function useJsonOnMount<T>(
  url: string,
  /**
   * The body, as this caller reads it. Runs inside the try, so a parse that
   * throws is treated as a request that did not land — which it effectively is.
   *
   * That is where the SCHEMA goes, and both callers put one there: this hook is
   * handed `unknown` on purpose, so a `read` that casts is a read with nothing
   * behind it. lib/api-contract.ts holds the schema for each endpoint, and the
   * route handler annotates its payload with the same type — see that module for
   * why the fallback below is what a rejection has to land on.
   */
  read: (body: unknown) => T,
  fallback: {
    /** Before the first answer. */
    initial: T;
    /** When there was no answer at all. Stated rather than defaulted, because
     *  what unreachable MEANS is the caller's to decide: an empty corpus is a run
     *  over everything, and an unknown runner is a refusal. */
    unreachable: T;
  },
): T {
  const [value, setValue] = useState<T>(fallback.initial);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const next = read((await response.json()) as unknown);
        if (live) setValue(next);
      } catch {
        if (live) setValue(fallback.unreachable);
      }
    })();

    return () => {
      live = false;
    };
    // The URL is the identity of this read, and the two callbacks are written
    // inline at every call site — depending on them would re-fetch on every
    // render. This hook reads once, on mount, which is what its name says.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return value;
}

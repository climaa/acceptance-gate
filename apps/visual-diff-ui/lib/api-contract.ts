import { z } from 'zod';
import { HistoryRecordSchema } from './job-contract';

/**
 * What this console's own endpoints answer with.
 *
 * Every file this app reads goes through zod — `SummarySchema` on a report,
 * `SetsFileSchema` on the registry, `HistoryRecordSchema` on the console's own
 * state — and a malformed one names the file and the failing path. Its own JSON
 * responses had none of that: six read sites cast, and `useJsonOnMount`'s `read`
 * callback was a generic hole every mount read poured its answer through.
 *
 * Same origin and same commit is why nothing had broken, and it is not a
 * mechanism. These endpoints were the one contract in this app no test could see
 * both sides of: a handler could change its payload and every suite here would
 * stay green — the shape of gap #364 closed on the argv seam, where `--dirty`
 * had lived for months with both halves green.
 *
 * So a schema here is the DEFINITION rather than a second opinion. Each type
 * below is `z.infer` of the schema beside it, the handler annotates its payload
 * with that type, and the reader parses. A payload annotation is an object
 * literal, so tsc checks it for missing AND excess fields — a stronger binding
 * than a runtime parse on the way out, and one that costs nothing per request.
 * `__tests__/api.test.ts` runs each real response back through its schema, so
 * that compile-time binding has a runtime witness.
 *
 * A parse that fails must land on the reader's STATED fallback: an unknown
 * runner is a refusal, an empty corpus is a run over everything, a poll that did
 * not land is the last answer kept. A schema that rejected onto a blank panel or
 * a thrown render would be worse than the cast it replaced.
 *
 * ZERO `node:` imports, which is the same contract lib/job-contract.ts states
 * and holds for the same reason: the components reading these responses are
 * client components, and a schema they cannot import is a schema they will cast
 * around. `__tests__/config.test.ts` holds it shut.
 */

/**
 * `GET /api/env` — what this host is, and whether it could borrow the pinned
 * container. lib/host.ts computes it; the accept gate compares the fingerprint
 * half of it, which is this shape minus `docker`.
 */
export const RunnerEnvSchema = z.object({
  platform: z.string(),
  arch: z.string(),
  /**
   * `null` unless declared. A process cannot see the image it runs in, and
   * guessing would be the one wrong answer here: an unfounded match is what
   * would let baselines be accepted from a host that never captured them.
   *
   * Which is also why the reader must fail CLOSED on a malformed answer rather
   * than read the fields it recognises. A response carrying an image and no
   * `docker` would otherwise pass `containerState` as native and offer a start
   * button on a claim nothing stood behind.
   */
  image: z.string().nullable(),
  /** Read off the image tag — policy pins the image and the library together. */
  playwright: z.string().nullable(),
  /** Whether a container could be started right now — the panel disables its
   *  start button on this, and `POST /api/jobs` refuses on it. */
  docker: z.boolean(),
});

export type RunnerEnv = z.infer<typeof RunnerEnvSchema>;

/** One component of the corpus, as the panel offers it. */
const StoryComponentSchema = z.object({
  /** What goes in `--filter`: the story id up to its `--`, which is the id every
   *  story of this component shares. */
  filter: z.string(),
  /** The last segment of the Storybook title — `Atoms/Button` is `Button`. */
  name: z.string(),
});

export type StoryComponent = z.infer<typeof StoryComponentSchema>;

/**
 * A tier and what is under it.
 *
 * `tier` is a plain string on purpose. The tier names live in
 * `@gate/visual-diff/policy`, which is where the differ reads them from and
 * where `readStories` orders them by; pinning them here would be a second list
 * free to disagree with that one — and this response is whatever the Storybook
 * build holds, which is not a fact this app gets to legislate.
 */
const StoryTierSchema = z.object({
  tier: z.string(),
  components: z.array(StoryComponentSchema),
});

export type StoryTier = z.infer<typeof StoryTierSchema>;

/** `GET /api/stories` — the corpus the checkout's Storybook build holds. An
 *  empty list is a real answer, not an error: a checkout nobody has built yet. */
export const StoriesResponseSchema = z.object({ tiers: z.array(StoryTierSchema) });

export type StoriesResponse = z.infer<typeof StoriesResponseSchema>;

/** `GET /api/label` — what the next capture set would be called, or `null` when
 *  there is no checkout, no git, or no legal label left in the branch name. The
 *  null is a real answer the panel renders as "no suggestion", so it is nullable
 *  rather than absent: a response with no `label` field at all is a handler that
 *  has drifted, and the wand says so instead of silently offering nothing. */
export const LabelResponseSchema = z.object({ label: z.string().nullable() });

export type LabelResponse = z.infer<typeof LabelResponseSchema>;

/**
 * `GET /api/jobs/current` — the poll target: what is running, or the last run
 * when nothing is, and what it has said.
 */
export const CurrentJobResponseSchema = z.object({
  /** Whether this instance is serving the committed fixture. The answer to "can
   *  this console ever have anything to poll for?" */
  isSample: z.boolean(),
  running: z.boolean(),
  /** The running job, or the last one to finish. Null on an instance that has
   *  never run anything. */
  job: HistoryRecordSchema.nullable(),
  /** Whether the report `job.reportId` names is still on disk, answered by the
   *  server on every poll. Not derivable client-side: a history row keeps the id
   *  of the report its run produced even after the report is deleted, so the id
   *  alone would offer a link into a 404 — see the route for why this is its
   *  answer to give. False whenever there is no report to begin with. */
  reportExists: z.boolean(),
  /** The tail of that job's log, oldest line first. The route's `TAIL_LINES` is
   *  how long it is, here and in the DOM. */
  log: z.array(z.string()),
});

export type CurrentJobResponse = z.infer<typeof CurrentJobResponseSchema>;

/** `POST /api/prune` — what the server actually kept, removed, and spared. The
 *  dialog reports `refused` back, which is why a prune that succeeded can still
 *  leave it open. */
export const PruneResponseSchema = z.object({
  kept: z.array(z.string()),
  removed: z.array(z.string()),
  refused: z.array(z.string()),
});

export type PruneResponse = z.infer<typeof PruneResponseSchema>;

/**
 * What a refused mutation answers with, on any of the routes.
 *
 * `error` is the part every refusal has, and the only part `refusalOf` reads.
 * The rest is per-route and deliberately unlisted: `conflict()` carries `extra`
 * beside the sentence — the running job, the sets a worktree holds — and this
 * schema is not the place those are decided.
 *
 * Which is what every `z.object` above does too. None of them is `.strict()`, so
 * a field a handler adds is stripped rather than rejected, and a reader is never
 * broken by a payload growing something it does not read. A field REMOVED is the
 * drift that matters, and that is the direction these all fail on.
 *
 * One exception, and it is not one in practice: `CurrentJobResponse.job` is
 * `HistoryRecordSchema`, which IS `.strict()`, so an extra field on a job record
 * would reject the whole poll. Nothing can send one — `readHistory` parses the
 * rows it serves through that same schema, so a record the poller would refuse
 * is a record the route never read off disk.
 */
export const RefusalSchema = z.object({ error: z.string() });

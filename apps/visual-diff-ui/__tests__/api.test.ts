// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GET as getCurrentJob } from '../app/api/jobs/current/route';
import { GET as getEnv } from '../app/api/env/route';
import { GET as getLabel } from '../app/api/label/route';
import { GET as getReport } from '../app/api/reports/[id]/route';
import { GET as getReports } from '../app/api/reports/route';
import { GET as getSets } from '../app/api/sets/route';
import { GET as getShot } from '../app/api/shots/[report]/[file]/route';
import { GET as getStories } from '../app/api/stories/route';
import {
  CurrentJobResponseSchema,
  LabelResponseSchema,
  RunnerEnvSchema,
  StoriesResponseSchema,
} from '../lib/api-contract';

/**
 * The read-only JSON and image surface. Every handler resolves the data
 * directory itself, and with `VISUAL_DIFF_DATA_DIR` unset that is the committed
 * fixture tree — which is also what a deployed instance with no CLI behind it
 * serves, so these run against exactly the shape sample mode ships.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
/** The second sample report: the IconButton stories entering the corpus, so the
 *  demo carries an `added` verdict as well as a `changed` one. */
const ADDED_REPORT = 'baselines__main-2026-08-24';
const SHOT = 'atoms__desktop__light__atoms-prose--default.diff.png';

const request = new Request('http://localhost:3300/');

const context = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

afterEach(() => {
  delete process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT;
  // `GET /api/label` is the one handler here that is pointed somewhere other
  // than the fixtures, because it is the one whose answer depends on what is
  // already on disk. Unset again so the rest of the file keeps its frame.
  delete process.env.VISUAL_DIFF_DATA_DIR;
});

describe('GET /api/sets', () => {
  it('serves the sample sets, badged as sample data', async () => {
    const response = await getSets();

    const body = (await response.json()) as { isSample: boolean; sets: unknown[] };
    expect(body.isSample).toBe(true);
    expect(body.sets).toHaveLength(3);
  });
});

describe('GET /api/reports', () => {
  it('serves the sample report list, badged as sample data', async () => {
    const response = await getReports();

    const body = (await response.json()) as {
      isSample: boolean;
      reports: { id: string }[];
    };
    expect(body.isSample).toBe(true);
    // Newest-first is a descending sort on the id, so `main-…` leads.
    expect(body.reports.map((report) => report.id)).toEqual([REPORT, ADDED_REPORT]);
  });
});

describe('GET /api/reports/[id]', () => {
  it('serves one validated summary', async () => {
    const response = await getReport(request, context({ id: REPORT }));

    const body = (await response.json()) as {
      isSample: boolean;
      report: { exitCode: number };
    };
    expect(response.status).toBe(200);
    expect(body.report.exitCode).toBe(1);
  });

  it('answers 404 for a report nothing captured', async () => {
    const response = await getReport(request, context({ id: 'never-ran' }));

    expect(response.status).toBe(404);
  });

  it('answers 404 for an id that climbs out of the data directory', async () => {
    const response = await getReport(request, context({ id: '../../../etc' }));

    expect(response.status).toBe(404);
  });
});

describe('GET /api/env', () => {
  it('reports the running host', async () => {
    const response = await getEnv();

    const body = (await response.json()) as { platform: string; arch: string };
    expect(body).toMatchObject({ platform: process.platform, arch: process.arch });
  });

  // The seam the accept gate is built on: nothing else feeds `image`, so a test
  // world drives the whole decision from this one variable.
  it('claims the image the environment declares', async () => {
    process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT =
      'mcr.microsoft.com/playwright:v1.62.1-noble';

    const response = await getEnv();

    const body = (await response.json()) as { image: string; playwright: string };
    expect(body).toMatchObject({
      image: 'mcr.microsoft.com/playwright:v1.62.1-noble',
      playwright: '1.62.1',
    });
  });

  it('claims no image when nothing declares one', async () => {
    const response = await getEnv();

    const body = (await response.json()) as { image: null; playwright: null };
    expect(body).toMatchObject({ image: null, playwright: null });
  });

  it('is never cached', async () => {
    const response = await getEnv();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

/**
 * The name the next capture would be given.
 *
 * Two halves meet in this handler — the branch sanitised into a label, and
 * `freeLabel` walking past whatever is already there — and only the second needs
 * a directory, which is why this is the one describe here that sets
 * `VISUAL_DIFF_DATA_DIR`. The branch is deliberately not pinned to a literal:
 * this suite runs on whatever is checked out, and on CI that is a detached HEAD.
 */
describe('GET /api/label', () => {
  // Reimplemented rather than imported from lib/jobs, so the assertion is a
  // second opinion instead of a restatement of the thing it checks — but on the
  // SAME clock, which is UTC: the label is sorted against `capturedAt`, and
  // `today` moved to UTC to agree with it. Read off the local clock, this
  // passed at home and failed for any runner far enough east or west that the
  // two calendars had already parted — Tokyo at 02:37 asks for the 25th of a
  // day UTC still calls the 24th.
  const today = () => {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');

    return `${now.getUTCFullYear()}-${month}-${day}`;
  };

  /** A data directory that exists and holds something, which is what
   *  `dataDirFrom` requires before it will read one instead of the fixtures. */
  const populatedDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-label-'));
    fs.mkdirSync(path.join(dir, 'sets'), { recursive: true });

    return dir;
  };

  /** Parsed, not cast: `LabelResponseSchema` is what the wand reads this answer
   *  with, so running every case below through it makes this describe the
   *  runtime witness for the label endpoint's half of that contract. */
  const read = async () => {
    const response = await getLabel();

    return {
      response,
      body: LabelResponseSchema.parse(await response.json()),
    };
  };

  it('names the checkout it is running in, and today', async () => {
    // Pointed away from the fixtures deliberately — see the note above. The
    // sample tree carries dated set labels of its own, and reading it here
    // would make this assertion depend on whether one of them happens to be
    // today's: the wand counts past a label it already has, and `-2` is not
    // the shape this case is about.
    process.env.VISUAL_DIFF_DATA_DIR = populatedDir();

    const { body } = await read();

    // Shape and day, not a name: the stem is whoever is looking. `detached` is
    // the stem on CI and is as legal as any other.
    expect(body.label).toMatch(new RegExp(`^[A-Za-z0-9][A-Za-z0-9.-]*-${today()}$`));
  });

  it('counts past a set this instance already has', async () => {
    // `sets/` up front, not just as a side effect below: an empty directory is
    // "no data here" to `dataDirFrom`, which would send the first read to the
    // fixtures and leave this comparing two labels from two different trees.
    const dir = populatedDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const first = (await read()).body.label;
    // Asserted rather than cast: a machine with no `git` answers null here, and
    // a null joined into a path fails three lines later saying nothing useful.
    expect(first).not.toBeNull();

    fs.mkdirSync(path.join(dir, 'sets', first as string), { recursive: true });

    const second = (await read()).body.label;

    expect(second).toBe(`${first}-2`);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is never cached, because a capture that just finished changes it', async () => {
    const { response } = await read();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('GET /api/shots/[report]/[file]', () => {
  it('serves a shot as an immutable PNG', async () => {
    const response = await getShot(request, context({ report: REPORT, file: SHOT }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('serves the bytes on disk', async () => {
    const response = await getShot(request, context({ report: REPORT, file: SHOT }));

    const bytes = new Uint8Array(await response.arrayBuffer());
    // The PNG signature, so the response is the image rather than an error page
    // that happened to arrive with a 200.
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it.each([
    ['a relative climb', REPORT, '../../summary.json'],
    ['an absolute path', REPORT, '/etc/passwd'],
    ['a climbing report id', '../..', SHOT],
    ['a file that is not a PNG', REPORT, 'summary.json'],
  ])('answers 404 for %s', async (_case, report, file) => {
    const response = await getShot(request, context({ report, file }));

    expect(response.status).toBe(404);
  });

  it('answers 404 for a PNG that is not there', async () => {
    const response = await getShot(
      request,
      context({ report: REPORT, file: 'never-captured.diff.png' }),
    );

    expect(response.status).toBe(404);
  });
});

/**
 * The runtime witness for the client contract.
 *
 * Each of these handlers annotates its payload with the type the console parses
 * that answer against, so tsc already refuses a field dropped or added on the
 * server. What a type cannot see is the trip through `Response.json` — an
 * `undefined` that vanishes, a value serialised as something else — and what it
 * cannot see at all is a handler nobody typechecked because it was never
 * imported here. These cases run the REAL response back through the REAL schema.
 *
 * `.parse`, not `.safeParse`: a miss should name the failing path in the report
 * rather than come back as `false`, which is the whole reason this app parses
 * files with zod instead of duck-typing them.
 *
 * `GET /api/label` is not here — it is exercised against a data directory of its
 * own above, and its schema case rides along there for the same reason.
 */
describe('every answer the console parses', () => {
  it('serves an env body the run panel can read', async () => {
    const response = await getEnv();

    const body = RunnerEnvSchema.parse(await response.json());
    expect(body.platform).toBe(process.platform);
  });

  it('serves a corpus the filter picker can read', async () => {
    const response = await getStories();

    const body = StoriesResponseSchema.parse(await response.json());
    // A deployment with no Storybook build answers with an empty list, which is
    // a real answer — so the shape is the assertion and the length is not.
    expect(Array.isArray(body.tiers)).toBe(true);
  });

  it('serves a poll the current-job region can read', async () => {
    const response = await getCurrentJob();

    const body = CurrentJobResponseSchema.parse(await response.json());
    // The fixture tree has no CLI behind it, which is the answer the poller
    // stops polling on.
    expect(body.isSample).toBe(true);
    expect(body.running).toBe(false);
  });
});

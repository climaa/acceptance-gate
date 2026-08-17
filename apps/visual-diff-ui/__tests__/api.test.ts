// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { GET as getEnv } from '../app/api/env/route';
import { GET as getReport } from '../app/api/reports/[id]/route';
import { GET as getReports } from '../app/api/reports/route';
import { GET as getSets } from '../app/api/sets/route';
import { GET as getShot } from '../app/api/shots/[report]/[file]/route';

/**
 * The read-only JSON and image surface. Every handler resolves the data
 * directory itself, and with `VISUAL_DIFF_DATA_DIR` unset that is the committed
 * fixture tree — which is also what a deployed instance with no CLI behind it
 * serves, so these run against exactly the shape sample mode ships.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const SHOT = 'atoms__desktop__light__atoms-prose--default.diff.png';

const request = new Request('http://localhost:3300/');

const context = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

afterEach(() => {
  delete process.env.VISUAL_DIFF_FAKE_HOST_FINGERPRINT;
});

describe('GET /api/sets', () => {
  it('serves the sample sets, badged as sample data', async () => {
    const response = await getSets();

    const body = (await response.json()) as { isSample: boolean; sets: unknown[] };
    expect(body.isSample).toBe(true);
    expect(body.sets).toHaveLength(2);
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
    expect(body.reports.map((report) => report.id)).toEqual([REPORT]);
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

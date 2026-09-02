import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { guardMutation } from '../lib/guard';
import {
  JOB_RUNNING,
  NOT_JSON,
  NOT_LOCAL,
  NOT_SAME_ORIGIN,
  SAMPLE_DATA,
} from '../lib/refusals';
import {
  resetRequestHeaders,
  setRequestHeaders,
  setRequestHost,
} from './stubs/next-headers';

/**
 * The order the mutation guard asks its four questions in.
 *
 * Three of the four are already asserted through the routes — a sample
 * instance is refused, a remote `Host` is refused, a held lock is refused — and
 * none of those cases pins the ORDER, because each sets up exactly one of the
 * three conditions at a time. Swapping `isSample` and the host check left all
 * 653 tests green, which is what this file is for: the sequence was stated in
 * four route comments and enforced nowhere. The fourth — where the request came
 * from — is asserted here and nowhere else, because no route can be reached from
 * another origin under vitest and the header that says so is the whole of it.
 *
 * It matters because the conditions overlap in production rather than in the
 * suite. A deployment is BOTH serving sample data and reachable from off the
 * machine, always — `next start` sets no data directory — so which sentence it
 * answers with is decided entirely by which question is asked first. Only one of
 * the two is true about what the reviewer is looking at: "there is nothing here
 * to change" describes a console showing this repo's committed fixtures, while
 * "start one from the console on your own machine" tells them to go somewhere
 * else and try again, where the same fixtures and the same refusal are waiting.
 *
 * Tested against `guardMutation` directly rather than through a route: the four
 * handlers now share one implementation, so asserting this four times over would
 * be four copies of a test for one function — the shape the guard itself exists
 * to stop.
 */

const REMOTE = 'visual-diff.example.com';

const temporaryDirs: string[] = [];

/** A data directory that is real but empty of the thing being asked for — enough
 *  for `dataDirFrom` to stop calling it sample data. */
function realDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-guard-'));
  temporaryDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify({ sets: [] }));

  return dir;
}

/** The lock a running job holds, naming this process so it reads as alive. */
function holdLock(dir: string): void {
  fs.writeFileSync(
    path.join(dir, 'job.lock'),
    JSON.stringify({
      pid: process.pid,
      mode: 'compare',
      label: 'main-2026-08-25',
      startedAt: '2026-08-25T10:00:00Z',
    }),
  );
}

const refusalOf = async (gate: Awaited<ReturnType<typeof guardMutation>>) => {
  if (!(gate instanceof Response)) throw new Error('expected a refusal, got a directory');

  return { status: gate.status, error: ((await gate.json()) as { error: string }).error };
};

afterEach(() => {
  resetRequestHeaders();
  delete process.env.VISUAL_DIFF_DATA_DIR;
  for (const dir of temporaryDirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('guardMutation', () => {
  it('hands a real, idle, local console the directory it may write', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    const gate = await guardMutation();

    expect(gate).not.toBeInstanceOf(Response);
    expect(gate).toEqual({ dir });
  });

  // The ordering case. Both conditions hold at once, which is every deployment.
  it('answers a deployed sample console about its data, not about its address', async () => {
    setRequestHost(REMOTE);

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: SAMPLE_DATA,
    });
  });

  it('refuses a real console reached from off the machine', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHost(REMOTE);

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: NOT_LOCAL,
    });
  });

  // The lock is asked about last, so a request that fails an earlier question
  // never reads the disk to find out whether one is held.
  it('refuses a local console while a job holds the directory', async () => {
    const dir = realDataDir();
    holdLock(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: JOB_RUNNING,
    });
  });

  it('says nothing about a held lock to a caller the address already refused', async () => {
    const dir = realDataDir();
    holdLock(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHost(REMOTE);

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_LOCAL);
  });
});

/**
 * The question asked before the other three: who asked for this.
 *
 * A cross-origin `POST` with `Content-Type: text/plain` is a CORS-simple
 * request — no preflight — and the browser attaches this machine's own `Host`,
 * so every one of the three questions below it answered "yes" for a page the
 * reviewer merely had open in another tab. `POST /api/prune` with `{"keep":0}`
 * deletes every capture set; `POST /api/jobs` runs a build and a container.
 * The `DELETE` routes were never reachable that way — a `DELETE` forces a
 * preflight, and this repo sets no `Access-Control-*` header anywhere — which
 * is why the body question below has to be asked only of requests that carry
 * one.
 *
 * WHAT THIS DOES NOT CLOSE, stated rather than implied: a client that sends
 * neither `Sec-Fetch-Site` nor `Origin` is let through. `curl` is such a
 * client, so `curl -H 'Host: localhost' -X POST http://<lan-ip>:3300/api/prune`
 * is not answered here. It is answered by binding the dev server to loopback —
 * `next dev -H 127.0.0.1` in this workspace's package.json — and that is the
 * half of this fix that closes it. Refusing absent-both instead would lock out
 * every non-browser client to catch an attacker who can simply omit a header,
 * which buys nothing the bind does not already buy outright.
 *
 * A browser cannot omit both: `fetch` and `XMLHttpRequest` always set `Origin`
 * cross-origin, form submissions have set it for years, and every current
 * engine sends `Sec-Fetch-Site` on everything. So the pass above describes a
 * client that is not a browser, and the CSRF this exists to stop needs one.
 */
describe('guardMutation: where the request came from', () => {
  it('refuses a mutation another site asked for, and says which', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({ 'sec-fetch-site': 'cross-site' });

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: NOT_SAME_ORIGIN,
    });
  });

  // `same-site` is a neighbouring origin, not this one: every port on localhost
  // shares the registrable domain, so the blog's dev server is `same-site` to
  // this console. Only the console's own pages may change what is on the disk.
  it('refuses a neighbour on the same site as firmly as a stranger', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({ 'sec-fetch-site': 'same-site' });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });

  it('hands the directory to a JSON mutation from the console own pages', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
    });

    expect(await guardMutation()).toEqual({ dir });
  });

  // `none` is the address bar: a request the reviewer made themselves, with no
  // page behind it. There is no origin to be foreign to.
  it('reads a request typed at the address bar as the console own', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({ 'sec-fetch-site': 'none' });

    expect(await guardMutation()).toEqual({ dir });
  });

  it('falls back to a matching Origin when no Sec-Fetch-Site was sent', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({
      'sec-fetch-site': null,
      origin: 'http://localhost:3300',
      host: 'localhost:3300',
    });

    expect(await guardMutation()).toEqual({ dir });
  });

  it('refuses a foreign Origin when no Sec-Fetch-Site was sent', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({
      'sec-fetch-site': null,
      origin: 'https://attacker.example.com',
      host: 'localhost:3300',
    });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });

  // `Origin: null` is what a sandboxed iframe and a few redirect chains send.
  // It parses as no URL at all, so it matches no host and is not this console.
  it('refuses an Origin that names nothing', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({ 'sec-fetch-site': null, origin: 'null' });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });

  // The `Host` half of the fallback fails closed, exactly as `isLocalHost`
  // does: an `Origin` with no address to be compared against is nobody's.
  it('refuses an Origin when the request states no address it arrived on', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({
      'sec-fetch-site': null,
      origin: 'http://localhost:3300',
      host: null,
    });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });

  // A prefix is not a media type. `application/jsonp` is a different body, and
  // the check that reads the type must not let one in by the first ten letters.
  it('refuses a media type that merely starts like JSON', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({ 'content-type': 'application/jsonp' });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_JSON);
  });

  // The decision written down at the top of this block, pinned so that changing
  // it is a change to a test rather than a silent one.
  it('lets a client that states neither through, which the loopback bind answers', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({ 'sec-fetch-site': null, origin: null });

    expect(await guardMutation()).toEqual({ dir });
  });

  // The CORS-simple path, and the whole reason this question is asked: a
  // `text/plain` body is what a form post and a no-preflight `fetch` send. Same
  // origin or not, this console reads a mutation body as JSON.
  it('refuses a body sent as text/plain even from the console own pages', async () => {
    process.env.VISUAL_DIFF_DATA_DIR = realDataDir();
    setRequestHeaders({
      'sec-fetch-site': 'same-origin',
      'content-type': 'text/plain;charset=UTF-8',
    });

    expect(await refusalOf(await guardMutation())).toEqual({
      status: 409,
      error: NOT_JSON,
    });
  });

  // The parameter is not the media type. `application/json; charset=utf-8` is
  // the same body as `application/json`, and refusing it would refuse a client
  // that spelled out what the default already is.
  it('reads a charset on the media type as the same JSON body', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({ 'content-type': 'application/json; charset=utf-8' });

    expect(await guardMutation()).toEqual({ dir });
  });

  // The two `DELETE` routes. They send no body and therefore no content type,
  // and a blanket check would refuse the two routes this fix leaves alone.
  it('asks nothing about the body of a request that carries none', async () => {
    const dir = realDataDir();
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHeaders({ 'content-type': null });

    expect(await guardMutation()).toEqual({ dir });
  });

  /**
   * The order, in the one shape that shows it: a deployed console is serving
   * sample data AND is off the machine AND may be holding a lock, and a
   * cross-site request to it hears about none of those. `resolveDataDir` does
   * filesystem work, and a request that should never have been honoured does
   * not get to cause any.
   */
  it('says nothing about the data or the address to a caller from another site', async () => {
    const dir = realDataDir();
    holdLock(dir);
    process.env.VISUAL_DIFF_DATA_DIR = dir;
    setRequestHost(REMOTE);
    setRequestHeaders({ 'sec-fetch-site': 'cross-site' });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });

  it('refuses a cross-site caller before it decides the console is sample', async () => {
    setRequestHeaders({ 'sec-fetch-site': 'cross-site' });

    expect((await refusalOf(await guardMutation())).error).toBe(NOT_SAME_ORIGIN);
  });
});

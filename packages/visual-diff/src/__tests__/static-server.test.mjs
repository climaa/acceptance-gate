import http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createStaticServer } from '../static-server.mjs';

const PREVIEW_SOURCE = 'export const ready = true;\n';

/** @type {string} the temp parent — `outside.txt` lives here, one level above the root */
let sandbox;
/** @type {string} */ let root;
/** @type {{ port: number, close: () => Promise<void> }} */ let server;

/** A raw request rather than `fetch`, because the WHATWG URL parser collapses `..`
 *  segments — including the `%2e%2e` spelling — before a byte reaches the socket, and
 *  the traversal and bad-encoding cases exist precisely to exercise paths no URL parser
 *  would let through. `http.request` sends `path` verbatim. */
const request = (requestPath, options = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.port, path: requestPath, ...options },
      (res) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('no answer')));
    req.on('error', reject);
    req.end();
  });

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'visual-diff-static-'));
  root = path.join(sandbox, 'storybook-static');

  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>corpus</title>');
  await writeFile(path.join(root, 'iframe.html'), '<!doctype html><title>story</title>');
  await writeFile(path.join(root, 'index.json'), '{"v":5}');
  await writeFile(path.join(root, 'assets', 'preview.mjs'), PREVIEW_SOURCE);
  await writeFile(path.join(root, 'assets', 'iframe.js'), 'globalThis.ready = true;\n');
  await writeFile(path.join(root, 'assets', 'tokens.css'), ':root { color: red; }\n');
  await writeFile(path.join(root, 'assets', 'body.woff2'), 'woff2 bytes');
  await writeFile(path.join(root, 'assets', 'stats.bin'), 'unknown bytes');
  await writeFile(path.join(sandbox, 'outside.txt'), 'not part of the corpus');

  server = await createStaticServer(root).listen();
});

afterAll(async () => {
  await server.close();
  await rm(sandbox, { recursive: true, force: true });
});

describe('listen', () => {
  it('takes an ephemeral port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('takes a different one per server, so two runs never collide', async () => {
    const second = await createStaticServer(root).listen();

    expect(second.port).not.toBe(server.port);

    await second.close();
  });

  it('stops answering once closed', async () => {
    const second = await createStaticServer(root).listen();
    const { port } = second;
    await second.close();

    const answered = request('/index.html', { port });

    await expect(answered).rejects.toThrow();
  });

  // Only as strong as this machine's interfaces: on a host with no non-loopback IPv4
  // there is nothing to prove the negative against. It is the sandbox's own eth0 that
  // gives the assertion teeth in CI.
  it('answers on no address but the loopback one', async () => {
    const external = Object.values(networkInterfaces())
      .flat()
      .filter((iface) => iface && iface.family === 'IPv4' && !iface.internal)
      .map((iface) => iface.address);

    const answered = [];
    for (const address of external) {
      try {
        await request('/index.html', { host: address, timeout: 2000 });
        answered.push(address);
      } catch {
        // refused or unanswered: the server is not on that interface
      }
    }

    expect(answered).toEqual([]);
  });
});

describe('serving', () => {
  it('serves index.html at the root', async () => {
    const response = await request('/');

    expect(response.body).toContain('corpus');
  });

  it('serves a file by its path', async () => {
    const response = await request('/assets/preview.mjs');

    expect(response.body).toBe(PREVIEW_SOURCE);
  });

  it('404s a file the build never wrote', async () => {
    const response = await request('/assets/missing.js');

    expect(response.status).toBe(404);
  });

  it('404s a directory rather than listing it', async () => {
    const response = await request('/assets');

    expect(response.status).toBe(404);
  });

  // Every run has to read the same bytes; a conditional request answered 304 from a
  // browser cache is a shot of whatever was cached, not of this build.
  it('sends no caching headers', async () => {
    const response = await request('/index.html');

    expect(response.headers['cache-control']).toBeUndefined();
    expect(response.headers.etag).toBeUndefined();
    expect(response.headers['last-modified']).toBeUndefined();
  });
});

describe('content types', () => {
  const cases = [
    ['/index.html', 'text/html'],
    // A module served as anything else is refused by the browser outright, and the
    // Storybook preview is ESM end to end.
    ['/assets/preview.mjs', 'text/javascript'],
    ['/assets/iframe.js', 'text/javascript'],
    ['/index.json', 'application/json'],
    ['/assets/tokens.css', 'text/css'],
    ['/assets/body.woff2', 'font/woff2'],
    ['/assets/stats.bin', 'application/octet-stream'],
  ];

  for (const [requestPath, type] of cases) {
    it(`serves ${requestPath} as ${type}`, async () => {
      const response = await request(requestPath);

      expect(response.headers['content-type']).toBe(type);
    });
  }
});

describe('path guards', () => {
  it('403s a path that climbs out of the root', async () => {
    const response = await request('/../outside.txt');

    expect(response.status).toBe(403);
  });

  it('403s the same climb spelled in percent-encoding', async () => {
    const response = await request('/%2e%2e/outside.txt');

    expect(response.status).toBe(403);
  });

  // The bypass a `new URL(...).pathname` guard lets through: the parser collapses `..`
  // segments before the escapes are decoded, so it reads this whole thing as one
  // innocent segment and never sees the climb.
  it('403s a climb hidden behind encoded separators', async () => {
    const response = await request('/assets%2f..%2f..%2foutside.txt');

    expect(response.status).toBe(403);
  });

  it('serves none of the escaping file’s bytes', async () => {
    const response = await request('/../outside.txt');

    expect(response.body).not.toContain('not part of the corpus');
  });

  it('keeps a climb that lands back inside the root', async () => {
    const response = await request('/assets/../index.html');

    expect(response.body).toContain('corpus');
  });

  it('400s a percent-escape that decodes to nothing', async () => {
    const response = await request('/%E0%A4%A');

    expect(response.status).toBe(400);
  });

  it('serves a path whose escapes are valid', async () => {
    const response = await request('/assets/%70review.mjs');

    expect(response.body).toBe(PREVIEW_SOURCE);
  });

  // Vite fingerprints some URLs with a query; the file on disk has none.
  it('ignores a query string', async () => {
    const response = await request('/assets/preview.mjs?t=1735689600');

    expect(response.body).toBe(PREVIEW_SOURCE);
  });
});

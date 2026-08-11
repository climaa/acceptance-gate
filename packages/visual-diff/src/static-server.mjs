// @ts-check
//
// The corpus over HTTP. `file://` cannot serve a Vite/ESM Storybook build — module
// scripts are fetched under the file scheme's opaque origin and every import is
// blocked — so the capture loop points the browser at this instead.
//
// Deliberately not a general-purpose static server: loopback only, no directory
// listings, no caching headers, no configuration. It exists to hand one build's bytes
// to one browser on the same machine, and every capability past that is attack surface
// or a source of run-to-run variance.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

/** Never `0.0.0.0`: the corpus is an unreleased UI, and the container the differ runs
 *  in is not always on a private network. */
export const LOOPBACK_HOST = '127.0.0.1';

/** Extension → `Content-Type`. `.mjs` and `.js` are `text/javascript` because a browser
 *  refuses a module served as anything else, which surfaces as a blank story rather
 *  than as a server error. */
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const DEFAULT_MIME = 'application/octet-stream';

/** @param {string} filePath */
const mimeOf = (filePath) =>
  MIME_TYPES[
    /** @type {keyof typeof MIME_TYPES} */ (path.extname(filePath).toLowerCase())
  ] ?? DEFAULT_MIME;

/** The requested path as a file inside `root`, or the status refusing it.
 *
 *  The target is split by hand rather than run through `new URL`, whose parser collapses
 *  `..` segments for us. That collapse is not a guard: it happens *before* the escapes
 *  are decoded, so `%2f..%2f..%2fetc` walks out of the root with a pathname the parser
 *  saw as a single innocent segment. Decode first, resolve, then check.
 *  @param {string} root an already-resolved absolute path
 *  @param {string} url the raw request target
 *  @returns {{ filePath: string, status?: undefined } | { status: number, filePath?: undefined }} */
function resolveFile(root, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.split(/[?#]/)[0]);
  } catch {
    return { status: 400 };
  }

  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(root, `.${requested}`);
  // Compare against `root + sep`, not `root`: a sibling directory whose name merely
  // starts with the root's — `storybook-static-old` next to `storybook-static` — is
  // outside the corpus and prefix-matches without it.
  if (!filePath.startsWith(root + path.sep)) return { status: 403 };

  return { filePath };
}

/** @param {import('node:http').ServerResponse} res @param {number} status */
const refuse = (res, status) => {
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end();
};

/** @param {string} root @param {import('node:http').IncomingMessage} req
 *  @param {import('node:http').ServerResponse} res */
async function serve(root, req, res) {
  const { filePath, status } = resolveFile(root, req.url ?? '/');
  if (filePath === undefined) return refuse(res, status);

  let body;
  try {
    body = await readFile(filePath);
  } catch (cause) {
    // EISDIR is a directory request: 404 rather than a listing, which would let a
    // capture navigate the corpus into pages no story owns.
    const code = /** @type {NodeJS.ErrnoException} */ (cause).code;
    return refuse(res, code === 'ENOENT' || code === 'EISDIR' ? 404 : 500);
  }

  res.writeHead(200, { 'content-type': mimeOf(filePath), 'content-length': body.length });
  res.end(body);
}

/** A server over one `storybook-static` directory.
 *  @param {string} rootDir the build to serve; resolved once, at construction
 *  @returns {{ listen: () => Promise<{ port: number, close: () => Promise<void> }> }} */
export function createStaticServer(rootDir) {
  const root = path.resolve(rootDir);

  return {
    listen: () =>
      new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
          serve(root, req, res).catch(() => refuse(res, 500));
        });

        server.once('error', reject);
        server.listen(0, LOOPBACK_HOST, () => {
          const address = server.address();
          if (address === null || typeof address === 'string') {
            reject(new Error('static server bound no port'));
            return;
          }

          resolve({
            port: address.port,
            close: () =>
              new Promise((closed, failed) => {
                // Without this, `close` waits on the keep-alive sockets the capture run
                // leaves open and the CLI hangs after its last shot.
                server.closeAllConnections();
                server.close((cause) => (cause ? failed(cause) : closed()));
              }),
          });
        });
      }),
  };
}

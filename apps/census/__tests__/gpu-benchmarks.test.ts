import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { GET, generateStaticParams } from '@/app/gpu-benchmarks/[file]/route';

/**
 * The route that serves detect-gpu's benchmark files from this site instead of
 * unpkg. Its contract: every file the pinned package ships is prerendered and
 * served byte-for-byte as JSON, and any other name is a 404.
 *
 * The expected list and contents are read off the installed package's own
 * `dist/benchmarks/` directory, not off the route's table: an expectation that
 * imports the value under test cannot catch that value being wrong, and a
 * package bump that adds a file must fail here until the route serves it.
 */

const require = createRequire(import.meta.url);
const BENCHMARKS_DIR = path.join(
  path.dirname(require.resolve('detect-gpu/package.json')),
  'dist',
  'benchmarks',
);

const shipped = fs
  .readdirSync(BENCHMARKS_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();

function shippedJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(BENCHMARKS_DIR, file), 'utf8'));
}

/** The request as Next hands it to the handler: params arrive as a promise. */
function request(file: string): Promise<Response> {
  return GET(new Request(`https://census.carloslima.dev/gpu-benchmarks/${file}`), {
    params: Promise.resolve({ file }),
  } as RouteContext<'/gpu-benchmarks/[file]'>);
}

describe('the prerendered benchmark files', () => {
  it('are every file the pinned detect-gpu ships, and nothing else', () => {
    const params = generateStaticParams();

    expect(params.map(({ file }) => file).sort()).toEqual(shipped);
  });
});

describe('a known benchmark file', () => {
  it.each(shipped)('%s is served as the package ships it', async (file) => {
    const response = await request(file);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual(shippedJson(file));
  });
});

describe('an unknown benchmark file', () => {
  // Names a client could ask for that the package does not ship: a plausible
  // vendor, the right name without its extension, and a path escape.
  it.each(['d-voodoo.json', 'd-apple', '../package.json', ''])(
    '%j is a 404 with no body',
    async (file) => {
      const response = await request(file);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    },
  );
});

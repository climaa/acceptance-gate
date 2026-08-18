// The data directory a local console reads and writes.
//
//   node scripts/local-data-dir.mjs <target-dir>
//
// `pnpm dev` runs this before `next dev`, because `resolveDataDir` reads an
// EMPTY directory as "no data here" and falls back to the committed fixtures —
// which is correct (it is what the e2e sample world is made of, and what a
// deployment looks like) but leaves a local console unable to start the very
// first job. An empty registry is the smallest honest thing that is not nothing:
// this instance has captured no sets, and says so.
//
// Idempotent, and it never overwrites. The directory is a reviewer's own
// captures, reports and promoted baselines; a boot that reset it would throw
// away the corpus the whole console exists to compare.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [target] = process.argv.slice(2);

if (!target) {
  console.error('✗ local-data-dir: needs a target directory');
  process.exit(1);
}

const dir = resolve(target);
const registry = resolve(dir, 'sets.json');

mkdirSync(dir, { recursive: true });

// The shape `SetsFileSchema` parses, with no `isSample` field: that flag is
// provenance the committed fixture carries, and a real instance never claims it.
if (!existsSync(registry)) writeFileSync(registry, '{\n  "sets": []\n}\n');

console.log(`visual-diff data directory: ${dir}`);

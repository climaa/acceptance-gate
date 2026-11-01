// The repository this console belongs to, read once at build time.
//
// Every child project ships the same console, so its header and its tab name the
// project before anything else. The name is the root `package.json`'s, so a copy
// of the console in a child names the child without an edit.
//
// Read here and inlined as `VISUAL_DIFF_PROJECT` — by next.config.mjs for the
// app, by Storybook's `viteFinal` for the screen stories, and by the Vitest
// config for the suite — rather than imported as JSON by `lib/site.ts`: Turbopack
// does not tree-shake a JSON import, and the whole manifest, scripts and
// devDependencies, landed in six client chunks when it was tried.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The `name` of the `package.json` at `root`. */
export function projectName(root) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
}

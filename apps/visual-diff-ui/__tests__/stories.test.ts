import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SKIP_TAG, TIERS } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, describe, expect, it } from 'vitest';
import { readStories } from '../lib/stories';

/**
 * The corpus the filter picker offers, read out of a Storybook build.
 *
 * Driven by written index files rather than by the repo's own build: this suite
 * has to be able to say what a skipped story and a story outside the tiers do,
 * and neither is something to add to `packages/ui` to prove.
 */

const temporaryDirs: string[] = [];

/** Whether this checkout has a Storybook build beside it right now. */
const BUILT = fs.existsSync(
  path.join(process.cwd(), '..', 'storybook', 'storybook-static', 'index.json'),
);

/** A checkout with one Storybook build in it, at the path `check` serves from. */
function checkoutWith(entries: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stories-'));
  temporaryDirs.push(root);
  const dir = path.join(root, 'apps', 'storybook', 'storybook-static');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: 5, entries }));

  return root;
}

const story = (over: Record<string, unknown> = {}) => ({
  id: 'atoms-button--primary',
  title: 'Atoms/Button',
  type: 'story',
  importPath: '../../packages/ui/src/atoms/Button/Button.stories.tsx',
  tags: [],
  ...over,
});

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readStories', () => {
  it('names a component by the id every one of its stories shares', () => {
    const tiers = readStories(
      checkoutWith({ a: story(), b: story({ id: 'atoms-button--ghost' }) }),
    );

    expect(tiers).toEqual([
      { tier: 'atoms', components: [{ filter: 'atoms-button', name: 'Button' }] },
    ]);
  });

  // The order the report draws its sections in, from policy rather than from
  // whatever order the build happened to list entries in.
  it('groups by tier, in the order policy names them', () => {
    const tiers = readStories(
      checkoutWith({
        a: story({
          id: 'organisms-table--default',
          title: 'Organisms/Table',
          importPath: '../../packages/ui/src/organisms/Table/Table.stories.tsx',
        }),
        b: story(),
      }),
    );

    expect(tiers.map((entry) => entry.tier)).toEqual(['atoms', 'organisms']);
    expect(TIERS.indexOf('atoms')).toBeLessThan(TIERS.indexOf('organisms'));
  });

  // Docs pages sit in the same index and are not captured, so offering one as
  // something to filter to would offer a run that captures nothing.
  it('leaves out the docs pages', () => {
    const tiers = readStories(
      checkoutWith({ a: story({ id: 'atoms-button--docs', type: 'docs' }) }),
    );

    expect(tiers).toEqual([]);
  });

  // A story that says it cannot be captured deterministically. Ticking it would
  // be ticking something the run then reports as skipped.
  it('leaves out a skipped story', () => {
    const tiers = readStories(checkoutWith({ a: story({ tags: [SKIP_TAG] }) }));

    expect(tiers).toEqual([]);
  });

  // `planCaptures` throws on one of these. This module is a list of things to
  // tick, so it leaves it out and lets the run be the place that complains.
  it('leaves out a story outside packages/ui/src/<tier>/', () => {
    const tiers = readStories(
      checkoutWith({ a: story({ importPath: './src/docs/Welcome.mdx' }) }),
    );

    expect(tiers).toEqual([]);
  });

  // A checkout nobody has captured from yet, or a deployment with no checkout at
  // all. The picker says what an empty corpus means; it is not an error.
  it('answers with nothing when there is no build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stories-'));
    temporaryDirs.push(root);

    expect(readStories(root)).toEqual([]);
  });

  it('answers with nothing outside a checkout', () => {
    expect(readStories(null)).toEqual([]);
  });

  // A half-written index is what a killed build leaves behind, and reading it as
  // "no stories" would offer an empty list as if the corpus were empty.
  it('refuses an index it cannot parse, rather than reporting an empty corpus', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stories-'));
    temporaryDirs.push(root);
    const dir = path.join(root, 'apps', 'storybook', 'storybook-static');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), '{"entries":{"a":{"id":1}}}');

    expect(() => readStories(root)).toThrow();
  });

  // The real build, so a Storybook that changes the shape of `index.json` fails
  // here rather than emptying the picker in a browser.
  //
  // Skipped when there is no build to read, which is the normal state in CI: this
  // workspace does not depend on `@gate/storybook`, so `turbo run test`'s `^build`
  // never makes one. Asserting unconditionally would be a case that only ever
  // passes on a machine that happens to have captured recently.
  it.skipIf(!BUILT)("reads this repo's own corpus", () => {
    const tiers = readStories();

    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      expect(TIERS).toContain(tier.tier);
      expect(tier.components.length).toBeGreaterThan(0);
    }
  });
});

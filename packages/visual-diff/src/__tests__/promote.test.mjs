// @ts-check
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { EXIT } from '../policy.mjs';
import { promote } from '../promote.mjs';

/**
 * `promote`: one report's candidates into a data directory's corpus (D3).
 *
 * These cases live here rather than in the console because the writing does. The
 * console used to promote in process and refuse off the pinned image; it now
 * runs this inside that image, so what it owns is the argv and what this owns is
 * every byte and every refusal.
 *
 * Nothing here goes near the committed `packages/visual-diff/__baselines__`.
 * Every case builds a data directory of its own and hands it over as
 * `--data-dir`, which is the same guarantee the module makes by refusing to
 * default that path at all.
 */

const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
  dirs.push(dir);

  return dir;
}

/** A host that is not probed: these cases are about what is written, and a real
 *  probe would make the stamp differ by machine. */
const HOST_STUB = async () => ({
  platform: 'linux',
  arch: 'x64',
  image: 'mcr.microsoft.com/playwright:v1.62.1-noble',
  playwright: '1.62.1',
});

const REPORT = 'a__b';

/** One report on disk, in the layout `promote` reads: a summary, and a candidate
 *  shot per variant that has one. */
function seedReport(dir, { variants, a11y = 0, shots = true } = {}) {
  const list = variants ?? [
    { key: 'atoms__desktop__light__atoms-prose--default', bucket: 'changed' },
  ];
  const at = path.join(dir, 'reports', REPORT);
  fs.mkdirSync(path.join(at, 'shots'), { recursive: true });
  fs.writeFileSync(
    path.join(at, 'summary.json'),
    JSON.stringify({ counts: { a11y, changed: list.length }, variants: list }),
  );

  if (!shots) return at;

  for (const [index, variant] of list.entries()) {
    if (variant.bucket === 'removed') continue;
    fs.writeFileSync(
      path.join(at, 'shots', `${variant.key}.candidate.png`),
      Buffer.from([index, 1, 2, 3]),
    );
  }

  return at;
}

const corpus = (dir) => path.join(dir, '__baselines__');
const run = (dir, opts = {}) =>
  promote(undefined, { dataDir: dir, reportId: REPORT, host: HOST_STUB, ...opts });

describe('promote', () => {
  it('copies a candidate shot into the corpus under its variant key', async () => {
    const dir = makeDataDir();
    const at = seedReport(dir);
    const key = 'atoms__desktop__light__atoms-prose--default';

    const result = await run(dir);

    expect(result.exitCode).toBe(EXIT.ok);
    expect(fs.readFileSync(path.join(corpus(dir), `${key}.png`))).toEqual(
      fs.readFileSync(path.join(at, 'shots', `${key}.candidate.png`)),
    );
  });

  // The stamp is the whole reason this runs where it runs: it records the machine
  // that wrote these bytes, and the next `check` compares against it.
  it('restamps the corpus with the host that wrote it', async () => {
    const dir = makeDataDir();
    seedReport(dir);

    await run(dir);

    expect(
      JSON.parse(fs.readFileSync(path.join(corpus(dir), 'BASELINE_ENV.json'), 'utf8')),
    ).toEqual(await HOST_STUB());
  });

  // D2: a `removed` variant is a baseline this run did not reproduce, and an
  // accept must not delete it as a side effect. It has no candidate by
  // definition, so it is skipped rather than refused.
  it('skips a removed variant instead of failing on its missing candidate', async () => {
    const dir = makeDataDir();
    seedReport(dir, {
      variants: [
        { key: 'atoms__desktop__light__atoms-prose--default', bucket: 'changed' },
        { key: 'atoms__desktop__dark__atoms-prose--default', bucket: 'removed' },
      ],
    });

    const result = await run(dir);

    expect(result.exitCode).toBe(EXIT.ok);
    expect(fs.readdirSync(corpus(dir)).filter((n) => n.endsWith('.png'))).toHaveLength(1);
  });

  it('refuses a report that still carries an accessibility failure', async () => {
    const dir = makeDataDir();
    seedReport(dir, { a11y: 2 });

    const result = await run(dir);

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('accessibility failure');
    expect(fs.existsSync(corpus(dir))).toBe(false);
  });

  // An `errored` variant has no candidate either, and unlike `removed` that takes
  // the whole promote down: the alternative is a corpus silently one story short.
  it('refuses when a variant that should have a candidate has none', async () => {
    const dir = makeDataDir();
    seedReport(dir, { shots: false });

    const result = await run(dir);

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toContain('no candidate shot to promote');
    expect(fs.existsSync(corpus(dir))).toBe(false);
  });

  it('refuses a report it cannot find, naming the id rather than the path', async () => {
    const dir = makeDataDir();

    const result = await run(dir, { reportId: 'nope' });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toBe('no report at reports/nope to promote');
  });

  /**
   * The one mistake this module must be incapable of making.
   *
   * `commands.mjs` derives its root from `import.meta.url`, so anything here that
   * defaulted a path would write the COMMITTED corpus when it meant to write a
   * data directory. Omitting it is a usage error, not a fallback.
   */
  it('refuses to promote at all without being told which tree to write', async () => {
    const result = await promote(undefined, { reportId: REPORT, host: HOST_STUB });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toBe('promote needs --data-dir');
  });

  it('refuses without a report to promote from', async () => {
    const result = await promote(undefined, { dataDir: makeDataDir(), host: HOST_STUB });

    expect(result.exitCode).toBe(EXIT.broken);
    expect(result.message).toBe('promote needs --report');
  });

  // Nothing is written until every shot is in memory and every budget has been
  // checked, so a refusal leaves the corpus exactly as it was — including one
  // that already held baselines.
  it('leaves an existing corpus untouched when it refuses', async () => {
    const dir = makeDataDir();
    seedReport(dir, { a11y: 1 });
    fs.mkdirSync(corpus(dir), { recursive: true });
    fs.writeFileSync(path.join(corpus(dir), 'kept.png'), Buffer.from([9]));

    await run(dir);

    expect(fs.readdirSync(corpus(dir))).toEqual(['kept.png']);
  });
});

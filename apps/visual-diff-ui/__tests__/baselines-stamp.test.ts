import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, describe, expect, it } from 'vitest';
import { BASELINES, baselinesStamp, stampFrom } from '../scripts/baselines-stamp.mjs';
import { baselinesPath, parseStamp } from '../lib/baselines';

/**
 * The build-time stamp a deployment shows as the corpus's provenance.
 *
 * Driven by written repositories, because the case that matters — a shallow
 * clone cut after the accepting commit — is not one this checkout is in.
 */

const temporaryDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-stamp-'));
  temporaryDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_AUTHOR_DATE: '2026-10-19T12:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-19T12:00:00Z',
    },
  }).trim();
}

/** A repository whose corpus is accepted in one commit and left alone by the next. */
function repoWithCorpusThenOther(): string {
  const root = tempDir();
  git(root, 'init', '--quiet');
  const corpus = path.join(root, 'packages', 'visual-diff', '__baselines__');
  fs.mkdirSync(corpus, { recursive: true });
  fs.writeFileSync(path.join(corpus, 'a__b__c__d.png'), 'x');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'accept');
  fs.writeFileSync(path.join(root, 'README.md'), 'later');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'unrelated');

  return root;
}

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('stampFrom', () => {
  const FULL = 'e4d6576' + '0'.repeat(33);

  it('joins the short sha and the date', () => {
    expect(stampFrom(`${FULL}\ne4d6576\n2026-10-19`, [])).toBe('e4d6576 2026-10-19');
  });

  // The commit a shallow clone was cut at "added" every file it holds, so a hit
  // on it says nothing about which commit really accepted the corpus.
  it('refuses a shallow clone boundary', () => {
    expect(stampFrom(`${FULL}\ne4d6576\n2026-10-19`, [FULL])).toBe('');
  });

  it('reads an empty log as no commit', () => {
    expect(stampFrom('', [])).toBe('');
  });
});

describe('baselinesStamp', () => {
  it('names the commit that last touched the corpus, not the tip', () => {
    const root = repoWithCorpusThenOther();
    const accept = git(root, 'rev-parse', '--short', 'HEAD~1');

    expect(baselinesStamp(root)).toBe(`${accept} 2026-10-19`);
  });

  it('answers with nothing outside a repository', () => {
    expect(baselinesStamp(tempDir())).toBe('');
  });

  // Depth 1 keeps only the unrelated tip, which git would otherwise name as the
  // commit that added the corpus.
  it('answers with nothing from a clone cut after the accepting commit', () => {
    const source = repoWithCorpusThenOther();
    const clone = path.join(tempDir(), 'clone');
    git(os.tmpdir(), 'clone', '--quiet', '--depth', '1', `file://${source}`, clone);

    expect(baselinesStamp(clone)).toBe('');
  });
});

// The two halves of one protocol, written in two modules: the build writes the
// stamp, the server reads it. Each is tested alone above, so a change to either
// side would leave both suites green and every deployed card drawing a dash.
describe('the stamp between build and server', () => {
  it('reads back what the build wrote', () => {
    const stamp = stampFrom(`${'a'.repeat(40)}\naaaaaaa\n2026-10-19`, []);

    expect(parseStamp(stamp)).toEqual({ sha: 'aaaaaaa', date: '2026-10-19' });
  });

  it('stamps the same corpus the server reads', () => {
    const root = path.join(os.tmpdir(), 'root');

    expect(path.join(root, BASELINES)).toBe(baselinesPath(root));
  });
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What `designs/*.pen` actually is, and what `.gitattributes` is allowed to say
 * about it.
 *
 * This app is the only workspace that consumes `designs/` — `.storybook/main.ts`
 * serves `designs/exports` and `src/docs/system-design/Overview.mdx` names the
 * `.pen` as the source of truth — so the fact lands here rather than in a
 * workspace that has never opened one.
 *
 * The `binary` marking is right and stays. What these cases pin is the reason
 * given for it. `.gitattributes` used to call the source an encrypted binary; it
 * is UTF-8 JSON in the clear, and anyone who clones this repo can read every
 * board in it with `cat`. That is fine for this project, but it has to be a
 * known fact rather than an assumed non-fact — outside this repo the Pencil MCP
 * server tells agents `.pen` files are encrypted and must never be read
 * directly, and this line was the repo-side corroboration of that.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const ATTRIBUTES = fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8');

/** The rule and the comment block immediately above it, whatever they say. */
const RULE = /((?:^#.*\n)*)^designs\/\*\.pen (.+)$/m;
const [, comment = '', flags = ''] = RULE.exec(ATTRIBUTES) ?? [];

const penSources = fs
  .readdirSync(path.join(REPO_ROOT, 'designs'))
  .filter((entry) => entry.endsWith('.pen'));

describe('the rule in .gitattributes', () => {
  it('exists, and matches a source that is actually committed', () => {
    expect(flags).not.toBe('');
    expect(penSources).not.toEqual([]);
  });

  // `binary` is git's built-in macro for `-diff -merge -text`. `-merge` is the
  // half that matters most: a three-way textual merge of two Pencil saves can
  // land a document Pencil will not reopen, and no gate here would catch it.
  it('marks the source binary, which is what suppresses the line merge', () => {
    expect(flags.split(/\s+/)).toContain('binary');
  });

  // A canary for the exact claim that was here, not a proof about prose — the
  // cases below are what actually read the bytes. It matches the assertion form
  // ("are encrypted binaries") and not the denial the comment now makes, so
  // stating the true fact does not red it.
  it('does not assert that the source is encrypted', () => {
    expect(comment).not.toMatch(/\b(?:is|are)\s+(?:an?\s+)?encrypted\b/i);
    expect(comment).not.toMatch(/\bencrypted\s+binar/i);
  });
});

describe.each(penSources)('designs/%s', (name) => {
  const bytes = fs.readFileSync(path.join(REPO_ROOT, 'designs', name));

  // Decoded and re-encoded rather than sniffed: a byte sequence that survives
  // the round trip is UTF-8, and one that does not comes back with U+FFFD and a
  // different length. An encrypted or compressed payload fails here.
  it('is text — UTF-8 that survives a decode/encode round trip', () => {
    const text = bytes.toString('utf8');

    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true);
    expect(text).not.toContain('�');
  });

  it('is a Pencil document in the clear, parseable with any JSON reader', () => {
    const document: unknown = JSON.parse(bytes.toString('utf8'));

    expect(document).toMatchObject({ version: expect.any(String) });
  });
});

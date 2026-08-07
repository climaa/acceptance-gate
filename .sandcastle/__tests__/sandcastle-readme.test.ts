import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const README = path.join(ROOT, '.sandcastle/README.md');

describe('.sandcastle/README.md', () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(README, 'utf8');
  });

  it('exists', () => {
    expect(fs.existsSync(README)).toBe(true);
  });

  it('documents how to run sandcastle (pnpm sandcastle / npx tsx)', () => {
    expect(content).toMatch(/pnpm sandcastle/);
    expect(content).toMatch(/npx tsx .sandcastle\/main\.mts/);
  });

  it('documents the completion-signal convention', () => {
    expect(content).toMatch(/<promise>COMPLETE<\/promise>/);
  });

  it('documents the run_in_background prohibition', () => {
    expect(content).toMatch(/run_in_background/);
  });

  it('documents the branch-name format', () => {
    expect(content).toMatch(/sandcastle\/issue-\{id\}/i);
  });

  it('documents required env vars (CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN)', () => {
    expect(content).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
    expect(content).toMatch(/GH_TOKEN/);
  });

  it('documents gitignored paths (logs/ and worktrees/)', () => {
    expect(content).toMatch(/logs\//);
    expect(content).toMatch(/worktrees\//);
  });

  it('documents CODING_STANDARDS.md role', () => {
    expect(content).toMatch(/CODING_STANDARDS\.md/);
  });

  it('carries no foreign issue/PR references (provenance rule)', () => {
    // Public file: lessons are stated as first-person production experience,
    // never as another repository's ticket numbers.
    expect(content).not.toMatch(/#\d{3,}/);
  });

  it('documents the no-op path (label, and that the issue is not closed)', () => {
    expect(content).toMatch(/sandcastle:no-op/);
    expect(content).toMatch(/not closed/i);
  });

  // Ceiling raised from 200 when the no-op section landed. It is a guard
  // against the file becoming a manual, not a budget — each new section has to
  // earn its lines, and this one documents a mechanism an operator has to
  // interact with by hand (removing the label).
  it('is within reasonable length (80–230 lines)', () => {
    const lines = content.split('\n').length;
    expect(lines).toBeGreaterThanOrEqual(80);
    expect(lines).toBeLessThanOrEqual(230);
  });
});

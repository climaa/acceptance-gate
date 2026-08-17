import * as fs from 'fs';
import { SANDCASTLE, read } from './helpers';

describe('sandcastle PR-based merge flow', () => {
  describe('merge-prompt.md', () => {
    const content = read('agent-docs/merge-prompt.md');

    it('does not directly push to main', () => {
      expect(content).not.toMatch(/git push origin main/);
    });

    it('opens a PR with gh pr create', () => {
      expect(content).toMatch(/gh pr create/);
    });

    it('enables squash auto-merge', () => {
      expect(content).toMatch(
        /gh pr merge.*--squash.*--auto|gh pr merge.*--auto.*--squash/,
      );
    });

    it('waits for PR state via gh pr view', () => {
      expect(content).toMatch(/gh pr view/);
    });

    it('closes issue with PR URL on MERGED state', () => {
      expect(content).toMatch(/MERGED/);
      expect(content).toMatch(/gh issue close/);
    });

    it('handles CLOSED/timeout without closing issue', () => {
      expect(content).toMatch(/CLOSED/);
      expect(content).toMatch(/gh issue comment/);
    });

    it('pushes the issue branch (not main)', () => {
      expect(content).toMatch(/git push origin/);
    });

    it('PR body includes Closes #<ID>', () => {
      expect(content).toMatch(/Closes #/);
    });

    it('closes an issue from exactly one command, and only on the MERGED path', () => {
      // `Closes #<ID>` in a PR body is a second, implicit closing mechanism —
      // GitHub fires it on merge — and a PR that changes no files still merges.
      // Step 1b keeps such a branch out of a PR entirely; this guards the
      // explicit half: no other command in the prompt may close an issue.
      const closing = [...content.matchAll(/```bash\n([\s\S]*?)```/g)]
        .map((m) => m[1]!)
        .filter((block) => block.includes('gh issue close'));
      expect(closing).toHaveLength(1);
      expect(closing[0]).toMatch(/Merged via PR/);
    });

    it('ticks issue checkboxes only on MERGED state', () => {
      const tickBlock = content.match(
        /if \[ "\$PR_STATE" = "MERGED" \][\s\S]*?gh issue edit.*--body-file[\s\S]*?fi/,
      );
      expect(tickBlock).not.toBeNull();
      expect(content).toMatch(/sed.*'s\/- \\\[ \\\]\/- \[x\]\/g'/);
    });

    it('deletes the issue branch only on MERGED state', () => {
      expect(content).toMatch(/git push origin --delete/);
      const deleteBlock = content.match(
        /if \[ "\$PR_STATE" = "MERGED" \][\s\S]*?git push origin --delete[\s\S]*?fi/,
      );
      expect(deleteBlock).not.toBeNull();
    });

    it('does not delete the branch unconditionally', () => {
      const lines = content.split('\n');
      const unconditional = lines.filter(
        (line, i) =>
          line.includes('git push origin --delete') &&
          !lines
            .slice(Math.max(0, i - 5), i)
            .some((prev) => /PR_STATE.*MERGED/.test(prev)),
      );
      expect(unconditional).toHaveLength(0);
    });
  });

  describe('main.mts', () => {
    const content = read('main.mts');

    it('does not contain git push origin main', () => {
      expect(content).not.toMatch(/git push origin main/);
    });

    it('does not local-merge branches into main', () => {
      expect(content).not.toMatch(/git merge.*--no-edit/);
    });
  });

  describe('no file in .sandcastle/ pushes directly to main', () => {
    it('grep returns no matches across all prompt files', () => {
      const files = fs
        .readdirSync(SANDCASTLE)
        .filter((f) => f.endsWith('.md') || f.endsWith('.mts'));
      for (const file of files) {
        expect(read(file)).not.toMatch(/git push origin main/);
      }
    });
  });
});

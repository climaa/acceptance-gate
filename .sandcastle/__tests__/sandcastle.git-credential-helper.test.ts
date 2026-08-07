import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

// the merger phase's isolated sandbox can fail `git push` with
// "no git credentials available in this environment" — GH_TOKEN alone lets the
// `gh` CLI authenticate, but plain `git push` needs a credential helper wired
// up. The fix adds a credential-helper setup step to the sandbox startup hook
// (onSandboxReady) so it runs with GH_TOKEN present at runtime (unavailable at
// docker build time, so it can't be a Dockerfile RUN).
describe('sandcastle git credential helper', () => {
  const content = read('sandcastle-config.mts');

  // Isolate the onSandboxReady hook array so assertions can't accidentally
  // match unrelated prose/comments elsewhere in the file.
  function onSandboxReadyBlock(src: string) {
    const idx = src.indexOf('onSandboxReady:');
    expect(idx).toBeGreaterThan(-1);
    // Grab a generous window covering the array literal.
    return src.slice(idx, idx + 800);
  }

  const block = onSandboxReadyBlock(content);

  it('wires a git credential helper in onSandboxReady (gh auth setup-git or git config credential.helper)', () => {
    expect(block).toMatch(/gh auth setup-git|credential\.helper|git-credential/);
  });

  it('gates the credential-helper setup on GH_TOKEN being present', () => {
    // The token isn't guaranteed in every environment; the setup must be a
    // no-op when GH_TOKEN is absent rather than erroring the whole run.
    expect(block).toMatch(/GH_TOKEN/);
  });

  it('keeps the existing CI=true pnpm install hook', () => {
    expect(block).toMatch(/CI=true pnpm install/);
  });
});

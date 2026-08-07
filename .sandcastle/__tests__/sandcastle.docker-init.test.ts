import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const DOCKERFILE = path.join(ROOT, '.sandcastle', 'Dockerfile');

const content = fs.readFileSync(DOCKERFILE, 'utf8');

// Guards the sandbox init process. The agent runs vitest/jest fork pools whose
// workers reparent to PID 1 when orphaned; without an init that reaps them they
// pile up as hundreds of <defunct> processes and thrash the sandbox (the cause
// of a real wedged run — a real wedged-run failure mode). tini as PID 1 reaps them.
describe('sandcastle Dockerfile: init process reaps zombies', () => {
  it('installs tini', () => {
    expect(content).toMatch(/apt-get install[\s\S]*\btini\b/);
  });

  it('uses tini as PID 1 in the ENTRYPOINT (not a bare sleep)', () => {
    const entrypoint = content
      .split('\n')
      .find((l) => l.trimStart().startsWith('ENTRYPOINT'));
    expect(entrypoint).toBeDefined();
    expect(entrypoint).toMatch(/tini/);
  });

  it('does not run sleep as PID 1 directly', () => {
    // A bare `ENTRYPOINT ["sleep", ...]` makes sleep PID 1, which never reaps.
    expect(content).not.toMatch(/ENTRYPOINT\s*\[\s*"sleep"/);
  });
});

import { read } from './helpers';

const mainContent = read('main.mts');

// The empty-plan rescue path handed rescued branches to the merger without the
// host push the planned path makes, and nothing remembered a branch it had
// rescued. The merger's own push runs the gate in its container, where it
// cannot pass, so the branch stayed unpublished and the next iteration rescued
// it again — every iteration of a run (trucutru #614 collected 64 comments;
// trucutru fixed it in #703, and this is the port).
describe('sandcastle stranded rescue — publishes once, rescues once per run', () => {
  const emptyPathStart = mainContent.indexOf('if (issues.length === 0) {');
  const emptyPathEnd = mainContent.indexOf(
    "console.log('\\nStranded branches merged.');",
  );
  const emptyPath = mainContent.slice(emptyPathStart, emptyPathEnd);

  it('isolates the empty-plan rescue path', () => {
    // Arrange / Act: the slice above.
    // Assert: both anchors exist, so the checks below are not run on nothing.
    expect(emptyPathStart).toBeGreaterThan(-1);
    expect(emptyPathEnd).toBeGreaterThan(emptyPathStart);
  });

  it('pushes rescued branches from the host before their merge', () => {
    // Arrange
    const pushIdx = emptyPath.indexOf('pushFromHost(verified)');
    const mergeIdx = emptyPath.indexOf('runMerger(verified');

    // Assert
    expect(pushIdx).toBeGreaterThan(-1);
    expect(mergeIdx).toBeGreaterThan(pushIdx);
  });

  it('declares the rescued-branch set outside the iteration loop', () => {
    // Arrange
    const setIdx = mainContent.indexOf('const rescuedBranches = new Set<string>()');
    const loopIdx = mainContent.indexOf('for (let iteration = 1;');

    // Assert
    expect(setIdx).toBeGreaterThan(-1);
    expect(loopIdx).toBeGreaterThan(setIdx);
  });

  it('excludes already-rescued branches on both rescue paths', () => {
    // Act
    const calls = mainContent.match(/collectStrandedIssues\([^;]*;/g) ?? [];

    // Assert
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call).toMatch(/rescuedBranches/);
  });

  it('records every branch it rescues', () => {
    // Act
    const adds = mainContent.match(/rescuedBranches\.add\(s\.branch\)/g) ?? [];

    // Assert
    expect(adds).toHaveLength(2);
  });
});

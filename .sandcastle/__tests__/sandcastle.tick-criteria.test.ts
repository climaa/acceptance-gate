import { tickCriteria, type GhRunner } from '../sandcastle-tick-criteria.mts';

// The merger's Step 5, with `gh` answered from memory: what it reads, what it
// writes back, what it prints, and what it never does.

const PR_URL = 'https://github.com/climaa/acceptance-gate/pull/840';
const ISSUE_BODY = '- [ ] The ledger traces every element';

interface Recorded {
  calls: { args: string[]; input?: string }[];
  out: string[];
  err: string[];
}

function fakeGh(prBody: string): { run: GhRunner; recorded: Recorded } {
  const recorded: Recorded = { calls: [], out: [], err: [] };
  const run: GhRunner = (args, input) => {
    recorded.calls.push({ args, input });
    if (args[0] === 'issue' && args[1] === 'view')
      return JSON.stringify({ body: ISSUE_BODY });
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({ body: prBody, url: PR_URL });
    }
    return '';
  };
  return { run, recorded };
}

function tick(argv: string[], prBody: string) {
  const { run, recorded } = fakeGh(prBody);
  const code = tickCriteria(argv, run, {
    out: (text) => recorded.out.push(text),
    err: (text) => recorded.err.push(text),
  });
  return { code, ...recorded };
}

describe('tickCriteria', () => {
  it('writes a changed body back through gh issue edit --body-file -', () => {
    // Arrange
    const prBody = '- [x] The ledger traces every element';

    // Act
    const { code, calls } = tick(['838', '840'], prBody);

    // Assert
    expect(code).toBe(0);
    expect(calls.at(-1)).toEqual({
      args: ['issue', 'edit', '838', '--body-file', '-'],
      input: '- [x] The ledger traces every element',
    });
  });

  it('writes nothing back when the body is unchanged', () => {
    // Arrange
    const prBody = 'No criteria here.';

    // Act
    const { calls } = tick(['838', '840'], prBody);

    // Assert
    expect(calls.map((call) => call.args.slice(0, 2))).toEqual([
      ['issue', 'view'],
      ['pr', 'view'],
    ]);
  });

  it('prints the closing comment, naming what the PR left open', () => {
    // Arrange
    const prBody = '- [ ] The ledger traces every element';

    // Act
    const { out } = tick(['838', '840'], prBody);

    // Assert
    expect(out).toEqual([
      `Merged via PR ${PR_URL}. Completed by Sandcastle.\n\n` +
        'The PR left these acceptance criteria for a human to verify, so they stay open:\n\n' +
        '- [ ] The ledger traces every element\n',
    ]);
  });

  it.each([[[]], [['838']], [['838', 'pr']], [['8.5', '840']]])(
    'refuses %j with the usage and exit code 2, asking gh nothing',
    (argv) => {
      // Arrange
      const prBody = '- [x] The ledger traces every element';

      // Act
      const { code, calls, err } = tick(argv, prBody);

      // Assert
      expect({ code, calls, err }).toEqual({
        code: 2,
        calls: [],
        err: ['usage: sandcastle-tick-criteria.mts <issue> <pr>\n'],
      });
    },
  );

  it('never closes the issue', () => {
    // Arrange
    const prBody = '- [x] The ledger traces every element';

    // Act
    const { calls } = tick(['838', '840'], prBody);

    // Assert
    expect(calls.some((call) => call.args.includes('close'))).toBe(false);
  });
});

import {
  mainReceiptReport,
  type ReceiptProbe,
  type Verdict,
  verdictOf,
} from '../sandcastle-main-receipt.mts';

/**
 * A run that lands something on `main` ends by saying whether `main`'s tree has a
 * receipt. Each PR is verified on its head, but the commit that lands has a tree
 * of its own once two branches crossed, and nothing reported that gap.
 */
describe('mainReceiptReport', () => {
  /** A probe whose `origin/main` is `head` after the fetch, with `--verify`'s verdict. */
  const probe = (
    head: string | null,
    verified: boolean | Verdict,
    fetched = true,
    notes = true,
  ) => {
    const calls: string[] = [];
    const verdict: Verdict =
      typeof verified === 'boolean' ? (verified ? 'verified' : 'no-receipt') : verified;
    const fake: ReceiptProbe = {
      fetch: () => {
        calls.push('fetch');
        return { main: fetched, notes: fetched && notes };
      },
      head: () => head,
      verify: () => {
        calls.push('verify');
        return verdict;
      },
    };
    return { fake, calls };
  };

  it('prints nothing when the run left main where it was', () => {
    // Arrange
    const { fake, calls } = probe('aaaaaaa1111', false);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toBeNull();
    expect(calls).toEqual(['fetch']);
  });

  it('says main has no receipt, with the commands that fix it, after branches crossed', () => {
    // Arrange
    const { fake } = probe('bbbbbbb2222', false);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toBe(
      'main has no receipt bbbbbbb. To give it one:\n' +
        '  git fetch origin refs/notes/gate:refs/notes/gate && ' +
        'git checkout main && git pull --ff-only && pnpm gate && git push origin refs/notes/gate',
    );
  });

  it('says main is verified, with its commit, once a receipt covers its tree', () => {
    // Arrange
    const { fake } = probe('bbbbbbb2222', true);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toBe('main verified bbbbbbb');
  });

  it('fetches before it reads main, so receipts written elsewhere count', () => {
    // Arrange
    const { fake, calls } = probe('bbbbbbb2222', true);

    // Act
    mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(calls).toEqual(['fetch', 'verify']);
  });

  it('asks when the starting commit was unreadable, since main may have moved', () => {
    // Arrange
    const { fake } = probe('bbbbbbb2222', true);

    // Act
    const line = mainReceiptReport(null, fake);

    // Assert
    expect(line).toBe('main verified bbbbbbb');
  });

  it('says the answer is unknown when origin/main cannot be read after the run', () => {
    // Arrange
    const { fake } = probe(null, true);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toMatch(/^main receipt unknown/);
  });

  it('says the answer is unknown when main could not be fetched, rather than trusting a stale one', () => {
    // Arrange — the stale origin/main still equals the start, which would read as "nothing moved".
    const { fake, calls } = probe('aaaaaaa1111', true, false);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toMatch(/^main receipt unknown: .* could not be fetched/);
    expect(calls).toEqual(['fetch']);
  });

  it('does not trust "no receipt" when this host\'s receipts diverged from origin\'s, and says how to join them', () => {
    // Arrange — the notes fetch was refused, so a receipt pushed from elsewhere is not here.
    const { fake } = probe('bbbbbbb2222', false, true, false);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toBe(
      "main receipt unknown for bbbbbbb: this host's receipts have diverged from origin's, " +
        'so one written elsewhere may be missing here. Join them, then ask again:\n' +
        '  git fetch origin +refs/notes/gate:refs/notes/gate-origin && ' +
        'git notes --ref=gate merge -s ours refs/notes/gate-origin && git push origin refs/notes/gate',
    );
  });

  it('still says main is verified when the receipts diverged but a receipt was found', () => {
    // Arrange
    const { fake } = probe('bbbbbbb2222', true, true, false);

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toBe('main verified bbbbbbb');
  });

  it('says the check broke, not that main has no receipt, when --verify fails another way', () => {
    // Arrange
    const { fake } = probe('bbbbbbb2222', 'broken');

    // Act
    const line = mainReceiptReport('aaaaaaa1111', fake);

    // Assert
    expect(line).toMatch(/^main receipt unknown for bbbbbbb: .* broke/);
  });
});

describe('verdictOf', () => {
  const NO_RECEIPT = '✗ no receipt for origin/main (tree 5a6c90ac02db)\n';

  it("reads exit 1 with the gate's own line as no receipt; any other failure is the check breaking", () => {
    // Arrange
    const runs: [number | null, string][] = [
      [0, '✓ origin/main verified'],
      [1, NO_RECEIPT],
      [2, ''],
      [null, ''],
    ];

    // Act
    const verdicts = runs.map(([status, output]) => verdictOf(status, output));

    // Assert
    expect(verdicts).toEqual(['verified', 'no-receipt', 'broken', 'broken']);
  });

  it('reads an exit 1 from an uncaught throw as broken, not as no receipt', () => {
    // Arrange — Node exits 1 on an uncaught error, e.g. a ref that does not resolve.
    const output = "Error: Command failed: git rev-parse 'deadbeef^{tree}'\n";

    // Act
    const verdict = verdictOf(1, output);

    // Assert
    expect(verdict).toBe('broken');
  });
});

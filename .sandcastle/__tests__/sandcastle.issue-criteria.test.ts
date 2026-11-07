import { closingComment, tickIssueCriteria } from '../sandcastle-issue-criteria.mts';

// #672: the merger ticked every issue box after a merge, including one the PR
// left open for a human. An issue box is ticked only when the PR ticked it.

const ISSUE = [
  '### Acceptance criteria',
  '',
  '- [ ] The ledger traces every element',
  '- [ ] A console capture prints no drift line',
].join('\n');

describe('tickIssueCriteria', () => {
  it('ticks every issue box when the PR ticked every one', () => {
    // Arrange
    const prBody = [
      '- [x] The ledger traces every element',
      '- [x] A console capture prints no drift line',
    ].join('\n');

    // Act
    const { body, leftOpen } = tickIssueCriteria(ISSUE, prBody, 667);

    // Assert
    expect(body).toBe(
      [
        '### Acceptance criteria',
        '',
        '- [x] The ledger traces every element',
        '- [x] A console capture prints no drift line',
      ].join('\n'),
    );
    expect(leftOpen).toEqual([]);
  });

  it('leaves open and annotates once a box the PR left for a human', () => {
    // Arrange
    const prBody = [
      '- [x] The ledger traces every element',
      '- [ ] A console capture prints no drift line (needs human verification)',
    ].join('\n');

    // Act
    const { body, leftOpen } = tickIssueCriteria(ISSUE, prBody, 667);

    // Assert
    expect(body.split('\n').slice(2)).toEqual([
      '- [x] The ledger traces every element',
      '- [ ] A console capture prints no drift line (needs human verification — #667)',
    ]);
    expect(body.match(/needs human verification/g)).toHaveLength(1);
    expect(leftOpen).toEqual(['A console capture prints no drift line']);
  });

  it('treats a ticked PR box marked for human verification as open', () => {
    // Arrange
    const prBody =
      '- [x] A console capture prints no drift line (needs human verification)';

    // Act
    const { body } = tickIssueCriteria(ISSUE, prBody, 667);

    // Assert
    expect(body).toContain(
      '- [ ] A console capture prints no drift line (needs human verification — #667)',
    );
  });

  it('leaves an issue box with no matching PR line as it is', () => {
    // Arrange
    const prBody = '- [x] The ledger traces every element';

    // Act
    const { body, leftOpen } = tickIssueCriteria(ISSUE, prBody, 667);

    // Assert
    expect(body.split('\n')[3]).toBe('- [ ] A console capture prints no drift line');
    expect(leftOpen).toEqual([]);
  });

  it('changes nothing more when run on its own output', () => {
    // Arrange
    const prBody = [
      '- [x] The ledger traces every element',
      '- [ ] A console capture prints no drift line (needs human verification)',
    ].join('\n');
    const once = tickIssueCriteria(ISSUE, prBody, 667);

    // Act
    const twice = tickIssueCriteria(once.body, prBody, 667);

    // Assert
    expect(twice.body).toBe(once.body);
    expect(twice.leftOpen).toEqual(once.leftOpen);
  });

  it('annotates before the CR of a CRLF body', () => {
    // Arrange
    const issue = '- [ ] A\r\n- [ ] B\r\n';
    const prBody = '- [x] A\n- [ ] B';

    // Act
    const { body } = tickIssueCriteria(issue, prBody, 1);

    // Assert
    expect(body).toBe('- [x] A\r\n- [ ] B (needs human verification — #1)\r\n');
  });
});

describe('closingComment', () => {
  it('is the plain merged line when nothing was left open', () => {
    // Arrange
    const url = 'https://github.com/climaa/acceptance-gate/pull/667';

    // Act
    const comment = closingComment(url, []);

    // Assert
    expect(comment).toBe(`Merged via PR ${url}. Completed by Sandcastle.`);
  });

  it('names each criterion left open for a human', () => {
    // Arrange
    const url = 'https://github.com/climaa/acceptance-gate/pull/667';

    // Act
    const comment = closingComment(url, ['A console capture prints no drift line']);

    // Assert
    expect(comment).toMatch(/^Merged via PR .*\/667\. Completed by Sandcastle\./);
    expect(comment).toContain('- [ ] A console capture prints no drift line');
  });
});

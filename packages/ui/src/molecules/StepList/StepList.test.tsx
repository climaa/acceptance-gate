import { SKIP_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StepList } from './StepList';
import { Empty } from './StepList.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

const SCENARIO = [
  { keyword: 'When', meaning: 'Action', text: 'I visit the console' },
  { keyword: 'Then', meaning: 'Outcome', text: 'I see each set' },
  { keyword: 'And', meaning: 'Conjunction', text: 'a dirty set is marked' },
] as const;

describe('StepList', () => {
  it('renders a semantic ordered list, one item per step, in order', () => {
    render(<StepList steps={[...SCENARIO]} />);

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');

    expect(list.tagName).toBe('OL');
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'When I visit the console',
      'Then I see each set',
      'And a dirty set is marked',
    ]);
  });

  it('renders nothing at all for no steps', () => {
    const { container } = render(<StepList steps={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('repeats a step that legitimately appears twice', () => {
    // Position, not text, is a step's identity — the console's "The selected job
    // tab is a link" opens two of its cycles with the same words.
    render(
      <StepList
        steps={[
          { keyword: 'When', text: 'I visit the console' },
          { keyword: 'Then', text: 'the tab is selected' },
          { keyword: 'When', text: 'I visit the console' },
        ]}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('runs', () => {
  it('gives a conjunction the run of the step it continues', () => {
    render(<StepList steps={[...SCENARIO]} />);

    const runs = screen.getAllByRole('listitem').map((item) => item.dataset.run);

    // The whole point: the trailing `And` is an outcome, not an action.
    expect(runs).toEqual(['action', 'outcome', 'outcome']);
  });

  it('carries a run across several conjunctions', () => {
    render(
      <StepList
        steps={[
          { keyword: 'When', meaning: 'Action', text: 'I visit' },
          { keyword: 'And', meaning: 'Conjunction', text: 'I choose two sets' },
          { keyword: 'And', meaning: 'Conjunction', text: 'I switch tab' },
          { keyword: 'Then', meaning: 'Outcome', text: 'the form is set' },
        ]}
      />,
    );

    const runs = screen.getAllByRole('listitem').map((item) => item.dataset.run);

    expect(runs).toEqual(['action', 'action', 'action', 'outcome']);
  });

  it('leaves a leading conjunction in no run, having nothing to continue', () => {
    render(
      <StepList
        steps={[
          { keyword: 'And', meaning: 'Conjunction', text: 'something first' },
          { keyword: 'Then', meaning: 'Outcome', text: 'a result' },
        ]}
      />,
    );

    const runs = screen.getAllByRole('listitem').map((item) => item.dataset.run);

    expect(runs).toEqual([undefined, 'outcome']);
  });

  it('starts no run for a meaning it has no rule for', () => {
    render(
      <StepList
        steps={[{ keyword: '*', meaning: 'Unknown', text: 'something happens' }]}
      />,
    );

    expect(screen.getByRole('listitem').dataset.run).toBeUndefined();
  });

  it('assigns no runs at all when no step carries a meaning', () => {
    render(
      <StepList
        steps={[
          { keyword: 'Given', text: 'a precondition' },
          { keyword: 'When', text: 'an act' },
        ]}
      />,
    );

    const runs = screen.getAllByRole('listitem').map((item) => item.dataset.run);

    expect(runs).toEqual([undefined, undefined]);
  });
});

describe('stories', () => {
  it('skips the one state that has no box to capture', () => {
    expect(Empty.tags).toContain(SKIP_TAG);
  });
});

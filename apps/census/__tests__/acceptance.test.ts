import { describe, expect, it } from 'vitest';

import { acceptanceValues, countScenarios } from '@/lib/collect/acceptance.ts';

const FEATURE = `Feature: Blog
  Scenario: The home lists posts
    Given the blog is open
    Then posts are listed

  Scenario Outline: A preview shows its card
    Given a link to <url>
    Then a card appears

    Examples:
      | url |
      | a   |
      | b   |

    Examples: more
      | url |
      | c   |
`;

describe('countScenarios', () => {
  it('counts a scenario once and an outline once per example row', () => {
    const count = countScenarios(FEATURE);

    expect(count).toBe(4);
  });

  it('counts scenarios inside a Rule', () => {
    const text = `Feature: F\n  Rule: R\n    Scenario: one\n      Given x\n    Scenario: two\n      Given y\n`;

    const count = countScenarios(text);

    expect(count).toBe(2);
  });

  it('counts a Background as no scenario', () => {
    const text = `Feature: F\n  Background:\n    Given x\n  Scenario: one\n    Given y\n`;

    const count = countScenarios(text);

    expect(count).toBe(1);
  });
});

describe('acceptanceValues', () => {
  const counts = { smoke: 1, about: 1, 'visual-diff-shot': 7, 'blog-content': 2 };

  it('gives each deployed app the scenarios of the features that visit it', () => {
    const values = acceptanceValues(counts);

    expect(values['apps/blog']).toEqual({
      dimension: 'acceptance',
      state: 'measured',
      scenarios: 2,
      features: ['about', 'smoke'],
    });
  });

  it('never counts a local feature towards a visit', () => {
    const values = acceptanceValues({ 'blog-content': 2 });

    expect(values['apps/blog']).toMatchObject({ scenarios: 0, features: [] });
  });

  it('measures an app no feature visits as zero, which is the gap', () => {
    const values = acceptanceValues(counts);

    expect(values['apps/manual']).toMatchObject({ state: 'measured', scenarios: 0 });
  });

  it('measures every deployed app, and only those', () => {
    const values = acceptanceValues(counts);

    expect(Object.keys(values).sort()).toEqual([
      'apps/blog',
      'apps/census',
      'apps/manual',
      'apps/storybook',
      'apps/visual-diff-ui',
    ]);
  });
});

describe('countScenarios on an empty file', () => {
  it('counts nothing in a file with no Feature', () => {
    expect(countScenarios('')).toBe(0);
  });
});

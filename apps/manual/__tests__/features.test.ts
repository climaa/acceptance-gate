import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeatureSource } from '@/lib/features';

/**
 * The parser is proven against a fixture, never against a live suite file. Its
 * behaviour has to be checkable without a product requirement changing shape
 * underneath it — and `sync.test.ts` is where the live files are the subject.
 */
const FIXTURE_LABEL = 'apps/manual/__tests__/fixtures/example.feature';

function parseFixture() {
  const source = readFileSync(
    new URL('./fixtures/example.feature', import.meta.url),
    'utf8',
  );

  return parseFeatureSource(source, FIXTURE_LABEL);
}

describe('parseFeatureSource', () => {
  it('reads the feature name and every scenario', () => {
    const feature = parseFixture();

    expect(feature.name).toBe('Example subject');
    expect(feature.scenarios).toHaveLength(2);
  });

  it('lifts Background steps out of the scenarios', () => {
    const feature = parseFixture();

    expect(feature.background).toEqual([
      { keyword: 'Given', text: 'the world is prepared' },
    ]);
    expect(feature.scenarios[0]?.steps[0]).toEqual({
      keyword: 'When',
      text: 'I do the thing',
    });
  });

  it('keeps steps flat and in authored order, including a return to When', () => {
    const feature = parseFixture();

    // The shape that rules out grouping by keyword: acting resumes after
    // asserting, so a Given/When/Then bucketing would reorder the reader's steps.
    expect(feature.scenarios[1]?.steps.map((step) => step.keyword)).toEqual([
      'When',
      'Then',
      'When',
      'Then',
      'But',
    ]);
  });

  it('captures tags rather than discarding them', () => {
    const feature = parseFixture();

    expect(feature.scenarios[0]?.tags).toEqual([]);
    expect(feature.scenarios[1]?.tags).toEqual(['@desktop']);
  });
});

describe('parseFeatureSource refuses what it cannot render', () => {
  it('throws on a Scenario Outline', () => {
    const source = [
      'Feature: F',
      '  Scenario Outline: Templated',
      '    When I use <thing>',
      '    Examples:',
      '      | thing |',
      '      | one   |',
    ].join('\n');

    expect(() => parseFeatureSource(source, 'F.feature')).toThrow(/Scenario Outline/);
  });

  it('throws on a DocString', () => {
    const source = [
      'Feature: F',
      '  Scenario: With a blob',
      '    When I send',
      '      """',
      '      body',
      '      """',
    ].join('\n');

    expect(() => parseFeatureSource(source, 'F.feature')).toThrow(/DocString/);
  });

  it('throws on a DataTable', () => {
    const source = [
      'Feature: F',
      '  Scenario: With a table',
      '    When I send',
      '      | a | b |',
    ].join('\n');

    expect(() => parseFeatureSource(source, 'F.feature')).toThrow(/DataTable/);
  });

  it('throws on a Rule', () => {
    const source = [
      'Feature: F',
      '  Rule: A rule',
      '    Scenario: Inside',
      '      When I act',
    ].join('\n');

    expect(() => parseFeatureSource(source, 'F.feature')).toThrow(/Rule/);
  });

  it('names the file and line so the failure is actionable', () => {
    const source = ['Feature: F', '  Scenario: S', '    When I send', '      | a |'].join(
      '\n',
    );

    expect(() => parseFeatureSource(source, 'some/where.feature')).toThrow(
      /some\/where\.feature:3/,
    );
  });

  it('throws on a file with no Feature at all', () => {
    expect(() => parseFeatureSource('# just a comment\n', 'empty.feature')).toThrow(
      /declares no Feature/,
    );
  });
});

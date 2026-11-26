import { Skeleton, Stack } from '@gate/ui';
import { isValidElement, Suspense, type ReactElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import ComparisonPage, { generateMetadata } from '../app/report/[id]/compare/[key]/page';
import { ComparisonContents } from '../components/ComparisonContents';
import { ReportContents } from '../components/ReportContents';
import { comparisonPath } from '../lib/comparison';
import { NOT_FOUND_TITLE } from '../lib/site';

/**
 * A comparison loaded cold — a shared link, a refresh: Next does not intercept,
 * so this route draws the report itself with the modal already open over it.
 *
 * Asserted on the element it returns rather than rendered, the way
 * intercepted-comparison.test.tsx asserts the route's intercepted twin: what
 * this file decides is that the report comes first and shows a skeleton while
 * it loads, that the modal waits on nothing visible, and which way in the modal
 * is told it was opened by. The two reads are their own suites'.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';

type PageProps = Parameters<typeof ComparisonPage>[0];

const propsFor = (id: string, key: string) =>
  ({ params: Promise.resolve({ id, key }) }) as PageProps;

type SuspenseElement = ReactElement<{ fallback: unknown; children: unknown }>;

function slots(props: PageProps) {
  const page = ComparisonPage(props) as ReactElement<{ children: unknown[] }>;
  const [report, comparison] = page.props.children as [SuspenseElement, SuspenseElement];
  return { page, report, comparison };
}

describe('ComparisonPage', () => {
  it('stacks the report and the comparison, the report first', () => {
    // Arrange
    const props = propsFor(REPORT, KEY);

    // Act
    const { page, report, comparison } = slots(props);

    // Assert
    expect(page.type).toBe(Stack);
    expect(report.type).toBe(Suspense);
    expect(comparison.type).toBe(Suspense);
    expect(isValidElement(report.props.children) && report.props.children.type).toBe(
      ReportContents,
    );
    expect(
      isValidElement(comparison.props.children) && comparison.props.children.type,
    ).toBe(ComparisonContents);
  });

  // Nothing is on screen yet on a cold load, so the report says it is coming.
  it('shows a skeleton while the report is still being read', () => {
    const { report } = slots(propsFor(REPORT, KEY));

    const fallback = report.props.fallback;

    expect(isValidElement(fallback) && fallback.type).toBe(Skeleton);
  });

  // A second loading state over the report's skeleton would be one too many.
  it('draws nothing while the comparison is still being read', () => {
    const { comparison } = slots(propsFor(REPORT, KEY));

    expect(comparison.props.fallback).toBeNull();
  });

  it('hands both reads the address it was loaded at', () => {
    const props = propsFor(REPORT, KEY);

    const { report, comparison } = slots(props);

    expect(
      (report.props.children as ReactElement<{ params: unknown }>).props.params,
    ).toBe(props.params);
    expect(
      (comparison.props.children as ReactElement<{ params: unknown }>).props.params,
    ).toBe(props.params);
  });

  // `direct`, not `report`: there is no report entry behind a cold load to go
  // back to, so closing replaces the address — see comparison-route.test.tsx.
  it('tells the modal it was opened directly', () => {
    const { comparison } = slots(propsFor(REPORT, KEY));

    const child = comparison.props.children as ReactElement<{ entry: unknown }>;

    expect(child.props.entry).toBe('direct');
  });
});

describe('generateMetadata', () => {
  it('titles the tab with the comparison the address names', async () => {
    const metadata = await generateMetadata(propsFor(REPORT, KEY));

    expect(metadata.title).toBe('Prose — Default · desktop/light');
    expect(metadata.alternates?.canonical).toBe(comparisonPath(REPORT, KEY));
  });

  it('titles the tab as a miss for a key the report lacks', async () => {
    const metadata = await generateMetadata(
      propsFor(REPORT, 'atoms__desktop__light__atoms-gone--default'),
    );

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });

  it('titles the tab as a miss for a report this instance does not have', async () => {
    const metadata = await generateMetadata(propsFor('nothing__here', KEY));

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });
});

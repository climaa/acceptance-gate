import { isValidElement, Suspense, type ReactElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import InterceptedComparison, {
  generateMetadata,
} from '../app/report/[id]/@modal/(.)compare/[key]/page';
import { ComparisonContents } from '../components/ComparisonContents';
import { comparisonPath } from '../lib/comparison';
import { NOT_FOUND_TITLE } from '../lib/site';

/**
 * A comparison opened from its report: Next intercepts the link and draws this
 * route into the report layout's `@modal` slot, over the report it keeps
 * mounted.
 *
 * Asserted on the element it returns rather than rendered, the way
 * comparison-contents.test.tsx asserts the read beneath it: what this file
 * decides is what shows while the read is in flight and which way in the modal
 * is told it was opened by — the read and the modal are their own suites'.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const KEY = 'atoms__desktop__light__atoms-prose--default';

type PageProps = Parameters<typeof InterceptedComparison>[0];

const propsFor = (id: string, key: string) =>
  ({ params: Promise.resolve({ id, key }) }) as PageProps;

type SuspenseElement = ReactElement<{ fallback: unknown; children: unknown }>;

describe('InterceptedComparison', () => {
  // The report is already on screen behind the slot; a skeleton there would
  // paint a second loading state over a page that has finished loading.
  it('draws nothing while the comparison is still being read', () => {
    const element = InterceptedComparison(propsFor(REPORT, KEY)) as SuspenseElement;

    expect(element.type).toBe(Suspense);
    expect(element.props.fallback).toBeNull();
  });

  it('hands the read the address it was opened at', () => {
    const props = propsFor(REPORT, KEY);

    const child = (InterceptedComparison(props) as SuspenseElement).props.children;

    expect(isValidElement(child) && child.type).toBe(ComparisonContents);
    expect((child as ReactElement<{ params: unknown }>).props.params).toBe(props.params);
  });

  // `report`, not `direct`: closing goes back to the report it came from
  // rather than replacing the entry with it — see comparison-route.test.tsx.
  it('tells the modal it was opened from the report', () => {
    const child = (InterceptedComparison(propsFor(REPORT, KEY)) as SuspenseElement).props
      .children as ReactElement<{ entry: unknown }>;

    expect(child.props.entry).toBe('report');
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

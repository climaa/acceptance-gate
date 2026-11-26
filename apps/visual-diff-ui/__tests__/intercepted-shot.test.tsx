import { isValidElement, Suspense, type ReactElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import InterceptedShot, {
  generateMetadata,
} from '../app/set/[label]/@modal/(.)shot/[key]/page';
import { ShotContents } from '../components/ShotContents';
import { NOT_FOUND_TITLE } from '../lib/site';

/**
 * A screenshot opened from its set: Next intercepts the link and draws this
 * route into the set layout's `@modal` slot, over the set it keeps mounted.
 *
 * Asserted on the element it returns rather than rendered, the way
 * intercepted-comparison.test.tsx asserts the comparison's twin: what this
 * file decides is what shows while the read is in flight and which way in the
 * modal is told it was opened by — the read is shot-contents.test.tsx's, the
 * title shot-meta.test.ts's.
 */

const LABEL = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';

type PageProps = Parameters<typeof InterceptedShot>[0];

const propsFor = (label: string, key: string) =>
  ({ params: Promise.resolve({ label, key }) }) as PageProps;

type SuspenseElement = ReactElement<{ fallback: unknown; children: unknown }>;

describe('InterceptedShot', () => {
  // The set is already on screen behind the slot; a skeleton there would
  // paint a second loading state over a page that has finished loading.
  it('draws nothing while the screenshot is still being read', () => {
    const element = InterceptedShot(propsFor(LABEL, KEY)) as SuspenseElement;

    expect(element.type).toBe(Suspense);
    expect(element.props.fallback).toBeNull();
  });

  it('hands the read the address it was opened at', () => {
    const props = propsFor(LABEL, KEY);

    const child = (InterceptedShot(props) as SuspenseElement).props.children;

    expect(isValidElement(child) && child.type).toBe(ShotContents);
    expect((child as ReactElement<{ params: unknown }>).props.params).toBe(props.params);
  });

  // `set`, not `direct`: the cold-loaded page is the one that swaps the close
  // button for a way back to the set.
  it('tells the modal it was opened from the set', () => {
    const child = (InterceptedShot(propsFor(LABEL, KEY)) as SuspenseElement).props
      .children as ReactElement<{ entry: unknown }>;

    expect(child.props.entry).toBe('set');
  });
});

describe('generateMetadata', () => {
  it('titles the tab with the screenshot the address names', async () => {
    const metadata = await generateMetadata(propsFor(LABEL, KEY));

    expect(metadata.title).toBe('Badge — Accent · desktop/light · main-2026-10-16');
    expect(metadata.alternates?.canonical).toBe(`/set/${LABEL}/shot/${KEY}`);
  });

  it('titles the tab as a miss for a key that names no variant', async () => {
    const metadata = await generateMetadata(propsFor(LABEL, 'nope'));

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });

  it('titles the tab as a miss for a label that is not one', async () => {
    const metadata = await generateMetadata(propsFor('../escape', KEY));

    expect(metadata).toEqual({ title: NOT_FOUND_TITLE });
  });
});

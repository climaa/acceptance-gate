import { Skeleton } from '@gate/ui';
import { isValidElement, Suspense, type ReactElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import ShotPage, { generateMetadata } from '../app/set/[label]/shot/[key]/page';
import { ShotContents } from '../components/ShotContents';
import { NOT_FOUND_TITLE } from '../lib/site';

/**
 * A screenshot loaded cold — a shared link, a refresh: Next does not
 * intercept, so this route draws the shot view as the page itself.
 *
 * Asserted on the element it returns rather than rendered, the way
 * intercepted-shot.test.tsx asserts the route's intercepted twin: what this
 * file decides is that a skeleton shows while the read is in flight and which
 * way in the shot view is told it was opened by — the read is
 * shot-contents.test.tsx's, the title shot-meta.test.ts's.
 */

const LABEL = 'main-2026-10-16';
const KEY = 'atoms__desktop__light__atoms-badge--accent';

type PageProps = Parameters<typeof ShotPage>[0];

const propsFor = (label: string, key: string) =>
  ({ params: Promise.resolve({ label, key }) }) as PageProps;

type SuspenseElement = ReactElement<{ fallback: unknown; children: unknown }>;

describe('ShotPage', () => {
  // Nothing is on screen yet on a cold load, so the page says it is coming —
  // unlike the intercepted twin, which draws nothing over a finished set.
  it('shows a skeleton while the screenshot is still being read', () => {
    // Act
    const element = ShotPage(propsFor(LABEL, KEY)) as SuspenseElement;

    // Assert
    expect(element.type).toBe(Suspense);
    const fallback = element.props.fallback;
    expect(isValidElement(fallback) && fallback.type).toBe(Skeleton);
  });

  it('hands the read the address it was loaded at', () => {
    // Arrange
    const props = propsFor(LABEL, KEY);

    // Act
    const child = (ShotPage(props) as SuspenseElement).props.children;

    // Assert
    expect(isValidElement(child) && child.type).toBe(ShotContents);
    expect((child as ReactElement<{ params: unknown }>).props.params).toBe(props.params);
  });

  // `direct`, not `set`: there is no set behind a cold load to close back to,
  // so the shot view offers the way back to its set instead of a close button.
  it('tells the shot view it was opened directly', () => {
    const child = (ShotPage(propsFor(LABEL, KEY)) as SuspenseElement).props
      .children as ReactElement<{ entry: unknown }>;

    expect(child.props.entry).toBe('direct');
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

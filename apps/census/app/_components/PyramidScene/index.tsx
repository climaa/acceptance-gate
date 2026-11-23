'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';

import { TestPyramid, type PyramidBand } from '@gate/ui';
import type { Rendition } from '@/lib/rendition.ts';
import { probe, rememberFlat } from './probe';

/**
 * three.js stays out of the server bundle and out of every visit that ends flat.
 * The loading state is the flat figure: it is already on the page beneath, so
 * the placeholder draws nothing over it.
 */
const Scene = dynamic(() => import('./Scene'), { ssr: false, loading: () => null });

export interface PyramidFigureProps {
  /** Base first, as `TestPyramid` takes them. */
  bands: PyramidBand[];
}

/**
 * The home's testing pyramid. The flat `TestPyramid` is always rendered: it is
 * what the server sends, what a screen reader reads and what the counts belong
 * to. Where `rendition()` allows it, the 3D scene is laid over the flat figure's
 * box, and the flat figure is hidden only once the scene's first frame is drawn.
 *
 * Storybook swaps this module for `apps/storybook/.storybook/census-pyramid.tsx`,
 * so the captures never meet WebGL.
 */
export function PyramidFigure({ bands }: PyramidFigureProps) {
  const [rendition, setRendition] = useState<Rendition>('flat');
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let live = true;
    void probe().then((next) => {
      if (live) setRendition(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const onDrawn = useCallback(() => setDrawn(true), []);
  const onFallback = useCallback(() => {
    rememberFlat();
    setRendition('flat');
    setDrawn(false);
  }, []);

  return (
    <div
      className={
        drawn
          ? 'census-pyramid-figure census-pyramid-figure--scene'
          : 'census-pyramid-figure'
      }
    >
      <TestPyramid bands={bands} />
      {rendition !== 'flat' && (
        <Scene
          bands={bands}
          still={rendition === 'still'}
          onDrawn={onDrawn}
          onFallback={onFallback}
        />
      )}
    </div>
  );
}

import { TestPyramid, type PyramidBand } from '@gate/ui';

/**
 * census's `@/app/_components/PyramidScene` as a story renders it: the flat
 * figure alone. The app lays a WebGL scene over it where the device allows, and
 * a capture must never depend on what the capturing machine's GPU can do, so
 * the screen stories see exactly the content the scene decorates.
 */
export function PyramidFigure({ bands }: { bands: PyramidBand[] }) {
  return <TestPyramid bands={bands} />;
}

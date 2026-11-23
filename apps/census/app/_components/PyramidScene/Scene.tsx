'use client';

import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, invalidate } from '@react-three/fiber';
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { bandWidths, dimensionHue, type PyramidBand } from '@gate/ui';

export interface SceneProps {
  /** Base first, as `TestPyramid` takes them. */
  bands: PyramidBand[];
  /** Reduced motion: the scene is drawn once and the controls are off. */
  still: boolean;
  /** The first frame is on screen, so the flat figure under it can hide. */
  onDrawn: () => void;
  /** The frame rate declined twice: hand the figure back to the flat one. */
  onFallback: () => void;
}

/** World units: the widest band's side, each band's height, the gap between. */
const SIDE = 2.4;
const BAND_HEIGHT = 0.8;
const GAP = 0.06;

/** Device pixel ratio: the display's own, and what a declining frame rate drops to. */
const DPR_FULL = 2;
const DPR_LOW = 1;

/**
 * How long the frame rate is sampled after the first frame: three of
 * `PerformanceMonitor`'s rounds (10 × 250 ms each). The canvas renders every
 * frame only for this long, because a monitor fed by on-demand frames reads the
 * pauses between drags as a slow GPU. Nothing moves meanwhile: the scene has no
 * animation, only a drag moves it.
 */
const SAMPLE_MS = 7_500;

/** The first declining round lowers the resolution; the second gives up. */
const DECLINES_TO_FALL_BACK = 2;

/** While the scene's first seconds are sampled, and what a decline does then. */
function useSampling(onFallback: () => void) {
  const [sampling, setSampling] = useState(true);
  const [dpr, setDpr] = useState(DPR_FULL);
  const declines = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setSampling(false), SAMPLE_MS);
    return () => clearTimeout(timer);
  }, []);

  const onDecline = () => {
    if (!sampling) return;
    declines.current += 1;
    if (declines.current >= DECLINES_TO_FALL_BACK) onFallback();
    else setDpr(DPR_LOW);
  };

  return { sampling, dpr, onDecline };
}

/** The figure this scene stands in for, which sets its box on the page. */
const FIGURE_SELECTOR = '.ds-test-pyramid__figure';

/**
 * The flat figure's box, relative to the wrapper both sit in, kept current as
 * the page resizes: the canvas covers exactly what the flat figure would draw.
 */
function useFigureBox(ref: RefObject<HTMLDivElement | null>): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties>();

  useEffect(() => {
    const wrapper = ref.current?.parentElement;
    const figure = wrapper?.querySelector(FIGURE_SELECTOR);
    if (!wrapper || !figure) return;

    const place = () => {
      const outer = wrapper.getBoundingClientRect();
      const inner = figure.getBoundingClientRect();
      setBox({
        left: inner.left - outer.left,
        top: inner.top - outer.top,
        width: inner.width,
        height: inner.height,
      });
    };
    const observer = new ResizeObserver(place);
    observer.observe(figure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [ref]);

  return box;
}

/** Each band's colour, read from the same design tokens the flat figure fills with. */
function useBandColours(bands: PyramidBand[]): string[] {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return bands.map((band) =>
      style.getPropertyValue(`--color-${dimensionHue(band.dimension)}`).trim(),
    );
  };
  const [colours, setColours] = useState(read);

  // The theme switch is `[data-theme]` on <html>; follow it.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColours(read());
      invalidate();
    });
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
    // `read` closes over `bands` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bands]);

  return colours;
}

/**
 * The bands as square frustums stacked base first, each running from its own
 * width to the width of the band above, as the flat figure's trapezoids do; the
 * top one closes to a point. Widths are TestPyramid's own log scale.
 */
function Bands({ bands, colours }: { bands: PyramidBand[]; colours: string[] }) {
  const widths = bandWidths(
    bands.map((band) => band.count),
    SIDE,
  );
  const height = bands.length * BAND_HEIGHT + Math.max(0, bands.length - 1) * GAP;

  return (
    <group position={[0, -height / 2, 0]}>
      {bands.map((band, i) => (
        <mesh
          key={band.dimension}
          position={[0, i * (BAND_HEIGHT + GAP) + BAND_HEIGHT / 2, 0]}
          rotation={[0, Math.PI / 4, 0]}
        >
          {/* A four-sided cylinder is a square frustum; its radius is half the diagonal. */}
          <cylinderGeometry
            args={[
              (widths[i + 1] ?? 0) / Math.SQRT2,
              widths[i]! / Math.SQRT2,
              BAND_HEIGHT,
              4,
            ]}
          />
          <meshStandardMaterial color={colours[i]} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The testing pyramid in 3D, laid over the flat figure. Decoration only: it is
 * hidden from assistive technology, and the counts beside it are still the flat
 * figure's. Past its first seconds it renders on demand, so it moves only while
 * it is dragged.
 */
export default function Scene({ bands, still, onDrawn, onFallback }: SceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useFigureBox(ref);
  const colours = useBandColours(bands);
  const { sampling, dpr, onDecline } = useSampling(onFallback);

  return (
    <div
      ref={ref}
      className={
        still
          ? 'census-pyramid-scene census-pyramid-scene--still'
          : 'census-pyramid-scene'
      }
      style={box}
      aria-hidden="true"
    >
      {box && (
        <Canvas
          frameloop={sampling ? 'always' : 'demand'}
          dpr={[DPR_LOW, dpr]}
          camera={{ position: [4.6, 2.6, 4.6], fov: 32 }}
          gl={{ alpha: true, antialias: true }}
          onCreated={onDrawn}
        >
          <PerformanceMonitor onDecline={onDecline}>
            <ambientLight intensity={1.1} />
            <directionalLight position={[3, 6, 4]} intensity={1.6} />
            <Bands bands={bands} colours={colours} />
            <OrbitControls
              enabled={!still}
              enablePan={false}
              enableZoom={false}
              minPolarAngle={Math.PI / 4}
              maxPolarAngle={Math.PI / 2}
            />
          </PerformanceMonitor>
        </Canvas>
      )}
    </div>
  );
}

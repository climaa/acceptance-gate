import dAdreno from 'detect-gpu/dist/benchmarks/d-adreno.json';
import dAmd from 'detect-gpu/dist/benchmarks/d-amd.json';
import dApple from 'detect-gpu/dist/benchmarks/d-apple.json';
import dGeforce from 'detect-gpu/dist/benchmarks/d-geforce.json';
import dIntel from 'detect-gpu/dist/benchmarks/d-intel.json';
import dNvidia from 'detect-gpu/dist/benchmarks/d-nvidia.json';
import dRadeon from 'detect-gpu/dist/benchmarks/d-radeon.json';
import mAdreno from 'detect-gpu/dist/benchmarks/m-adreno.json';
import mAppleIpad from 'detect-gpu/dist/benchmarks/m-apple-ipad.json';
import mApple from 'detect-gpu/dist/benchmarks/m-apple.json';
import mIntel from 'detect-gpu/dist/benchmarks/m-intel.json';
import mMaliT from 'detect-gpu/dist/benchmarks/m-mali-t.json';
import mMali from 'detect-gpu/dist/benchmarks/m-mali.json';
import mNvidia from 'detect-gpu/dist/benchmarks/m-nvidia.json';
import mPowervr from 'detect-gpu/dist/benchmarks/m-powervr.json';
import mSamsung from 'detect-gpu/dist/benchmarks/m-samsung.json';

/**
 * detect-gpu's benchmark files, served from this site instead of unpkg, its
 * default: the probe runs on every visit, and a third-party fetch on every visit
 * is a dependency the page gains nothing from. Imported from the pinned package
 * rather than copied, so a bump brings its own data, and prerendered, so each
 * file is a static response.
 */
const BENCHMARKS: Readonly<Record<string, unknown>> = {
  'd-adreno.json': dAdreno,
  'd-amd.json': dAmd,
  'd-apple.json': dApple,
  'd-geforce.json': dGeforce,
  'd-intel.json': dIntel,
  'd-nvidia.json': dNvidia,
  'd-radeon.json': dRadeon,
  'm-adreno.json': mAdreno,
  'm-apple-ipad.json': mAppleIpad,
  'm-apple.json': mApple,
  'm-intel.json': mIntel,
  'm-mali-t.json': mMaliT,
  'm-mali.json': mMali,
  'm-nvidia.json': mNvidia,
  'm-powervr.json': mPowervr,
  'm-samsung.json': mSamsung,
};

export function generateStaticParams() {
  return Object.keys(BENCHMARKS).map((file) => ({ file }));
}

export async function GET(
  _request: Request,
  ctx: RouteContext<'/gpu-benchmarks/[file]'>,
) {
  const { file } = await ctx.params;
  const benchmark = BENCHMARKS[file];

  // The list above is every file the package ships; any other name is unknown.
  return benchmark === undefined
    ? new Response(null, { status: 404 })
    : Response.json(benchmark);
}

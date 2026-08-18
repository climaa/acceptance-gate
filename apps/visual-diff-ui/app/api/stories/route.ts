import { connection } from 'next/server';
import { readStories } from '@/lib/stories';

/**
 * What there is to capture: the tiers this checkout's Storybook build holds, and
 * the components under each.
 *
 * `connection()` first, for the reason every other route here has one: the answer
 * is synchronous filesystem work, so without it `next build` would resolve it on
 * a machine with no Storybook build and bake an empty corpus into a deployment
 * that has one.
 *
 * An empty list is a real answer — a checkout nobody has captured from yet, or a
 * deployment with no checkout at all — so this never 404s. `no-store` because a
 * build lands between two polls and a cached corpus is the one before it.
 */
export async function GET(): Promise<Response> {
  await connection();

  return Response.json(
    { tiers: readStories() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

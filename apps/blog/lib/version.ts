import manifest from '../package.json';

/**
 * The release this build was cut from: this app's own manifest version, which
 * RELEASING.md bumps in lockstep with every other manifest at a release cut.
 *
 * Its own module rather than a line in `site.ts`, on purpose. Client components
 * import `site.ts` (the error boundaries among them), and a JSON import there would
 * put the whole manifest — every dependency and script — into the browser bundle.
 * Only the server layout imports this file, so only the string ships.
 */
export const SITE_VERSION: string = manifest.version;

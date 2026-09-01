/**
 * Giscus — the comment thread each release entry can open on demand.
 *
 * Everything here is pure: the ids, the term derivation, and the two guards
 * that decide whether a `message` event came from a thread we are waiting on.
 * The mounting itself lives in `components/ChangelogSyncButton.tsx`, because
 * mounting is the effect and this is the contract it works against.
 */

/**
 * The only origin a giscus embed ever posts from, and the only one we accept a
 * message from or send a config to.
 *
 * A literal rather than a value derived from the script URL: this string is the
 * security check, so it must not be computed from anything the page could be
 * talked into changing.
 */
export const GISCUS_ORIGIN = 'https://giscus.app';

export const GISCUS_SCRIPT_URL = `${GISCUS_ORIGIN}/client.js`;

/** The repository the discussions live in — the same one this blog is built from. */
export const GISCUS_REPO = 'climaa/acceptance-gate';

/**
 * The repository's GraphQL node id, and the id of the discussion category
 * threads are opened in.
 *
 * Both come from the GitHub API rather than from a person reading them off
 * `giscus.app`'s configurator — `repository(owner:, name:) { id
 * discussionCategories { nodes { id name } } }` returns exactly these two
 * values. They are opaque handles, not secrets: giscus requires them in
 * client-side markup, so they are public by construction and belong in the
 * source rather than in an environment variable that would have to be set on
 * every deploy target to make the page work.
 *
 * The category is `Announcements`, which is the type giscus recommends and the
 * only one that gets the property that matters here: nobody but a maintainer
 * can open a discussion in it. A reader can comment on a release; a reader
 * cannot manufacture a release thread that never shipped.
 */
/* Annotated `string` rather than left to infer. Without it TypeScript narrows
 * each of these to its own literal type, `GISCUS_CONFIGURED` becomes a
 * comparison it can answer at compile time, and the fork-safety check below is
 * a tautology the compiler reports as a mistake. The annotation says what is
 * true: these are values a fork replaces. */
export const GISCUS_REPO_ID: string = 'R_kgDOTvDI0A';

export const GISCUS_CATEGORY = 'Announcements';

export const GISCUS_CATEGORY_ID: string = 'DIC_kwDOTvDI0M4DEqVS';

/**
 * Whether the embed can be mounted at all.
 *
 * An embed missing either id builds an iframe that fails inside itself, with
 * nothing on the outside to read — which would leave the control animating a
 * load that cannot finish, and end on the timeout's red every time. So the
 * button is not rendered at all when this is false, and `/changelog` is exactly
 * the page it was before any of this existed.
 *
 * Written as a check rather than assumed, because these are the two values a
 * fork of this repository has to replace, and a fork that forgets should get a
 * page with no comment control rather than one with a broken one.
 */
export const GISCUS_CONFIGURED = GISCUS_REPO_ID !== '' && GISCUS_CATEGORY_ID !== '';

/**
 * The discussion one release's thread lives in.
 *
 * `/changelog` is a single page carrying every version, so giscus's default
 * `pathname` mapping would give all of them one thread and one set of
 * reactions. The mapping is `specific` and this is the term, derived from the
 * tag — the only part of a release that never changes, unlike its title, its
 * body and its date.
 *
 * A term is PERMANENT once a thread exists under it. Renaming one does not move
 * the conversation: giscus finds no discussion with the new term, opens an
 * empty one, and the old thread keeps every comment it had with nothing linking
 * to it. Change the prefix and every existing release thread is abandoned in
 * place, silently. That is why the derivation is written once, here.
 */
export function discussionTerm(tag: string): string {
  return `changelog-${tag}`;
}

/** How giscus names the two themes. `[data-theme]` decides which — never `prefers-color-scheme`. */
export function giscusTheme(dark: boolean): string {
  return dark ? 'dark' : 'light';
}

/**
 * The attributes giscus's loader reads off its own `<script>` tag.
 *
 * `emit-metadata` is the one that is not decoration: it is what makes a mounted
 * embed post its discussion metadata back to the parent, which is the only
 * signal from inside the iframe that the thread actually rendered. Without it
 * there is nothing to wait for but a timeout, and a timeout can only ever
 * conclude failure.
 *
 * `loading="lazy"` is giscus's own attribute for its iframe, and it is safe
 * here for the reason it usually is not: the script is injected by a press, so
 * the container is on screen when it runs.
 */
export function giscusScriptAttributes(
  term: string,
  dark: boolean,
): Record<string, string> {
  return {
    'data-repo': GISCUS_REPO,
    'data-repo-id': GISCUS_REPO_ID,
    'data-category': GISCUS_CATEGORY,
    'data-category-id': GISCUS_CATEGORY_ID,
    'data-mapping': 'specific',
    'data-term': term,
    'data-strict': '1',
    'data-reactions-enabled': '1',
    'data-emit-metadata': '1',
    'data-input-position': 'top',
    'data-theme': giscusTheme(dark),
    'data-lang': 'en',
    'data-loading': 'lazy',
    crossorigin: 'anonymous',
  };
}

/** The shape of the metadata message, once it has been established to be one. */
export interface GiscusMetadataMessage {
  giscus: { discussion: unknown };
}

/**
 * Whether a `message` payload is giscus announcing that a discussion rendered.
 *
 * A mounted embed posts several shapes on this channel — resize heights most
 * often — and only the metadata one means the thread is actually there. This
 * checks for the discussion key rather than for the absence of the others, so a
 * shape giscus adds later cannot be mistaken for this one.
 *
 * Being from the right origin is checked separately and is not enough on its
 * own: every embed already on the page keeps posting from that origin, so origin
 * plus shape would let an OLDER thread's resize traffic answer for the mount
 * currently being waited on. The third filter — the message's `source` against
 * the pending container's own frame — is in the component, because only the
 * component knows which container is pending.
 */
export function isGiscusMetadataMessage(data: unknown): data is GiscusMetadataMessage {
  if (typeof data !== 'object' || data === null) return false;

  const { giscus } = data as { giscus?: unknown };
  if (typeof giscus !== 'object' || giscus === null) return false;

  return 'discussion' in giscus;
}

/**
 * Re-themes one already-mounted embed.
 *
 * Per iframe, never "the giscus on the page": there is one embed per release
 * that has been opened, and a theme flip has to reach all of them. The origin is
 * passed as the target rather than `'*'` so the message cannot be read by a
 * frame that is not giscus.
 */
export function postGiscusTheme(frame: HTMLIFrameElement, dark: boolean): void {
  frame.contentWindow?.postMessage(
    { giscus: { setConfig: { theme: giscusTheme(dark) } } },
    GISCUS_ORIGIN,
  );
}

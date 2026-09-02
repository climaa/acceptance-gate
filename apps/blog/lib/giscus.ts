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

/**
 * The loader, injected on a press.
 *
 * No `integrity` attribute, and that is a decision rather than an oversight:
 * giscus publishes no subresource-integrity hash and rolls `client.js` in place,
 * so a pinned hash would break the feature on their next deploy rather than
 * secure it. What that leaves is a third-party script with full access to this
 * page, which is the standing cost of the embed — bounded here by loading it
 * only on a press, and only on `/changelog`.
 */
export const GISCUS_SCRIPT_URL = `${GISCUS_ORIGIN}/client.js`;

/**
 * The class giscus's loader puts on the div it wraps its iframe in — and, the
 * part that matters here, the class it looks for BEFORE it makes one.
 *
 * `client.js` opens its placement with `document.querySelector('.giscus')`. If
 * that finds an element anywhere in the document it empties that element and
 * appends the iframe there; only when it finds nothing does it build a div of
 * its own beside the script tag. One page, one embed — reasonable for a post,
 * and wrong for `/changelog`, where every release has a thread of its own.
 *
 * Left alone, that made the second press a silent three-way failure. The
 * release that was asked about stayed empty, so the hook waited on an iframe
 * that was never going to be in the container it was watching and settled on
 * the timeout as `failed`. The release opened FIRST had its conversation
 * emptied out and replaced by the second one's, so a reader scrolling back up
 * found another version's thread under the wrong heading. And no press after
 * the first could ever succeed, because the div doing the capturing was still
 * there.
 *
 * So a mounted thread stops answering to this name the moment it is mounted —
 * `releaseMountedThread` in `hooks/useGiscusThreads.ts`.
 */
export const GISCUS_CONTAINER_CLASS = 'giscus';

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

/**
 * The error giscus reports for a release nobody has commented on yet.
 *
 * It is NOT a failure, and getting that wrong is a live bug rather than a
 * hypothetical: with `mapping=specific`, giscus only has a discussion once
 * someone posts the first comment. Until then the embed renders completely — 0
 * reactions, 0 comments, a Write/Preview box and a sign-in link — and reports
 * this. Measured against the real service on this repository: a usable textarea
 * and no `discussion` metadata, ever.
 *
 * So waiting for `discussion` means waiting for something that never comes on
 * an empty release, and every release is empty until its first comment. The
 * control would have spun for fifteen seconds and then shown a red cross over a
 * conversation sitting right there, working.
 *
 * Matched on the string because it is the only thing that crosses the frame
 * boundary — `data-lang` is pinned to `en` so the wording is at least stable
 * per locale, and `__tests__/giscus.test.ts` records the exact literal.
 */
export const EMPTY_THREAD_ERROR = 'Discussion not found';

/** What one message from a giscus frame says about the mount it belongs to. */
export type GiscusOutcome = 'mounted' | 'failed';

/**
 * What a `message` payload from giscus means, or null when it means nothing.
 *
 * A mounted embed posts several shapes and most of them answer nothing — resize
 * heights, chiefly — so the common case is null and the caller keeps waiting.
 *
 * Two shapes end a mount. A `discussion` key is the thread arriving with its
 * contents. An `error` is giscus telling us it will not be rendering one, EXCEPT
 * for the empty-thread case above, which is a rendered embed with nothing in it
 * yet and therefore the same success as a full one: the conversation is there,
 * and that is what the control claims.
 *
 * Reading the error at all is worth its own note. Before this, an embed that
 * failed outright — the app not installed on the repository, say — posted its
 * error, was ignored as "not the metadata shape", and left the reader watching a
 * spinner until the timeout fifteen seconds later. The timeout is for silence.
 * When giscus tells us it failed, believing it is both faster and more honest.
 *
 * Being from the right origin is checked separately and is not enough on its
 * own: every embed already on the page keeps posting from that origin, so origin
 * plus shape would let an OLDER thread's traffic answer for the mount currently
 * being waited on. The third filter — the message's `source` against the pending
 * container's own frame — is in the hook, because only it knows which container
 * is pending.
 */
export function giscusOutcome(data: unknown): GiscusOutcome | null {
  if (typeof data !== 'object' || data === null) return null;

  const { giscus } = data as { giscus?: unknown };
  if (typeof giscus !== 'object' || giscus === null) return null;

  if ('discussion' in giscus) return 'mounted';

  if ('error' in giscus) {
    const { error } = giscus as { error?: unknown };
    return error === EMPTY_THREAD_ERROR ? 'mounted' : 'failed';
  }

  return null;
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

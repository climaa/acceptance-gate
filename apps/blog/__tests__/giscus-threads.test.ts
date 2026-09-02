// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { injectLoader, threadContainer } from '../hooks/useGiscusThreads';

/**
 * Where one release's thread lands, and — the part that broke — where the next
 * one does.
 *
 * The one file in this suite besides `error.test.ts` to declare `jsdom`. It has
 * to: what is under test is a placement decision made against the whole
 * document, and there is no document under `environment: 'node'`.
 */

/** The page `/changelog` renders: one empty container per release, in order. */
function renderReleases(...tags: string[]): void {
  document.body.innerHTML = tags
    .map(
      (tag) =>
        `<article id="${tag}"><div data-release-comments="${tag}"></div></article>`,
    )
    .join('');
}

/**
 * The three lines of giscus's `client.js` that decide which container an embed
 * lands in, transcribed from the served bundle:
 *
 *     var d = document.querySelector(".giscus");
 *     if (d) { for (; d.firstChild;) d.firstChild.remove(); d.appendChild(e) }
 *     else { d = document.createElement("div"); d.setAttribute("class", "giscus");
 *            d.appendChild(e); m.insertAdjacentElement("afterend", d) }
 *
 * A stand-in rather than the real script, which is a network fetch and an
 * iframe to another origin — neither of which jsdom will do and neither of
 * which decides anything. This rule is the whole of the behavior under test,
 * so it is copied rather than paraphrased: if Giscus changes it, this file
 * should be re-read against the bundle rather than trusted.
 *
 * The `load` dispatch at the end is the spec's, not a convenience. A classic
 * script fires it at the end of the same task that executed the script, which
 * is the timing the fix depends on.
 */
function runLoader(script: HTMLScriptElement): void {
  const frame = document.createElement('iframe');
  frame.className = 'giscus-frame';
  frame.dataset.term = script.dataset.term ?? '';

  const reused = document.querySelector('.giscus');
  if (reused) {
    reused.replaceChildren(frame);
  } else {
    const wrapper = document.createElement('div');
    wrapper.className = 'giscus';
    wrapper.append(frame);
    script.insertAdjacentElement('afterend', wrapper);
  }

  script.dispatchEvent(new Event('load'));
}

/** A press: the loader goes in, and the loader runs. */
function press(tag: string): void {
  const container = threadContainer(tag);
  if (!container) throw new Error(`no container for ${tag}`);

  injectLoader(container, tag, vi.fn());
  const scripts = container.querySelectorAll('script');
  runLoader(scripts[scripts.length - 1] as HTMLScriptElement);
}

/** The term of the thread sitting under one release, or null when none is. */
function threadUnder(tag: string): string | null {
  const frame = threadContainer(tag)?.querySelector('iframe');
  return frame?.getAttribute('data-term') ?? null;
}

describe('opening one release thread after another', () => {
  beforeEach(() => {
    renderReleases('v1.3.0', 'v1.2.0');
  });

  it('gives the first release its own thread', () => {
    press('v1.3.0');

    expect(threadUnder('v1.3.0')).toBe('changelog-v1.3.0');
  });

  it('leaves the loader nothing to reuse once a thread has mounted', () => {
    press('v1.3.0');

    expect(document.querySelector('.giscus')).toBeNull();
  });

  /**
   * The regression. Without the release, the second press is captured by the
   * first release's div: `changelog-v1.2.0` renders under `v1.3.0`, on top of
   * the thread already there, and `v1.2.0` stays empty until the mount times
   * out fifteen seconds later and the control shows a red cross over a
   * conversation nobody ever loaded.
   */
  it('gives a second release its own thread rather than the first one theirs', () => {
    press('v1.3.0');

    press('v1.2.0');

    expect(threadUnder('v1.2.0')).toBe('changelog-v1.2.0');
    expect(threadUnder('v1.3.0')).toBe('changelog-v1.3.0');
  });

  /**
   * A retry clears its own container first, which throws away that release's
   * div — so the release it performed has to survive being redone, not just
   * being done once.
   */
  it('keeps a retried release in its own container', () => {
    press('v1.3.0');
    press('v1.2.0');
    threadContainer('v1.2.0')?.replaceChildren();

    press('v1.2.0');

    expect(threadUnder('v1.2.0')).toBe('changelog-v1.2.0');
    expect(threadUnder('v1.3.0')).toBe('changelog-v1.3.0');
  });

  /**
   * The reader who starts one thread, scrolls on, and starts another before the
   * first has landed. Both loaders are in the document before either runs, so
   * nothing a press could sweep beforehand exists yet — only releasing at the
   * end of each run puts each thread where it was asked for.
   */
  it('gives each release its own thread when two presses overlap', () => {
    const first = threadContainer('v1.3.0');
    const second = threadContainer('v1.2.0');
    injectLoader(first as HTMLElement, 'v1.3.0', vi.fn());
    injectLoader(second as HTMLElement, 'v1.2.0', vi.fn());

    runLoader(first?.querySelector('script') as HTMLScriptElement);
    runLoader(second?.querySelector('script') as HTMLScriptElement);

    expect(threadUnder('v1.3.0')).toBe('changelog-v1.3.0');
    expect(threadUnder('v1.2.0')).toBe('changelog-v1.2.0');
  });

  /** A loader that never runs reports through its own callback, and releases nothing. */
  it('reports a loader that fails to load', () => {
    const onError = vi.fn();
    const container = threadContainer('v1.3.0') as HTMLElement;
    injectLoader(container, 'v1.3.0', onError);

    container.querySelector('script')?.dispatchEvent(new Event('error'));

    expect(onError).toHaveBeenCalledOnce();
    expect(threadUnder('v1.3.0')).toBeNull();
  });
});

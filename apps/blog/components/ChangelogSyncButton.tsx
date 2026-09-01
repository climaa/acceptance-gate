'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';
import {
  discussionTerm,
  giscusScriptAttributes,
  GISCUS_ORIGIN,
  GISCUS_SCRIPT_URL,
  isGiscusMetadataMessage,
  postGiscusTheme,
} from '@/lib/giscus';
import {
  commentsGoToLabel,
  commentsLoadingLabel,
  commentsLoadLabel,
  commentsRetryLabel,
  COMMENTS_FAILED_NOTE,
} from '@/lib/site';
import { ChangelogSyncStill } from './ChangelogSyncStill';
import { LottieBlock } from './LottieBlock';

const LOTTIE_SRC = '/lottie/changelog-sync.lottie';

/** The machine inside the file — see the manifest's `stateMachines`. */
const STATE_MACHINE = 'changelog-sync';

/**
 * The icon's box, in pixels. Square and fixed — nothing on this page reflows
 * because the icon changed state.
 *
 * 256 rather than the 128 it shipped at first. At 128 the control read as a
 * decoration parked in the margin: it is the only thing in that column, it
 * carries no label, and the artwork inside it is a whole small scene — a sheet
 * with four lines of text on it, a pencil, and the sync badge that actually
 * changes between states. At half this size the badge is the part that has to
 * carry the check mark, the cross and the spin, and it was about 27px across.
 *
 * Still under the artboard's own 512, so it never renders past native
 * resolution. It costs the release text nothing: the column it sits in is
 * `auto`-width so the text column narrows by the difference, but the text
 * inside it is capped at a reading measure well short of that — measured at
 * 705px before and after, on a 1280 viewport.
 */
const ICON_SIZE = 256;

/**
 * How long a mount is given before it is called a failure.
 *
 * The only timeout this control is allowed to have, and it can only ever
 * conclude the negative. A timer that concluded success would be the icon
 * showing a green check over a conversation that never arrived — which is the
 * exact lie the whole design is arranged to prevent, reached by the laziest
 * possible route.
 *
 * Fifteen seconds because the signal being waited on is a third-party iframe
 * doing its own network work: a slow phone on a bad connection is ordinary and
 * should not be told it failed, while a reader watching a spinner past this
 * point has already concluded the same thing the timer is about to.
 */
const MOUNT_TIMEOUT_MS = 15_000;

type ThreadStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** The machine's state for each status. The names are the file's, not ours. */
const STATE_FOR_STATUS: Record<ThreadStatus, string> = {
  idle: 's-idle',
  loading: 's-syncing',
  ready: 's-synced',
  failed: 's-failed',
};

const LABEL_FOR_STATUS: Record<ThreadStatus, (tag: string) => string> = {
  idle: commentsLoadLabel,
  loading: commentsLoadingLabel,
  ready: commentsGoToLabel,
  failed: commentsRetryLabel,
};

/** One release, as this control needs it. */
export interface ChangelogSyncRelease {
  tag: string;
}

export interface ChangelogSyncButtonProps {
  /** Every release on the page, in the order the page renders them. */
  releases: ChangelogSyncRelease[];
}

/** Whether the document is in the dark theme. The attribute decides — its absence is light. */
function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

/** The container the page rendered under one release, or null when that release is not on the page. */
function threadContainer(tag: string): HTMLElement | null {
  const containers = document.querySelectorAll<HTMLElement>('[data-release-comments]');
  for (const container of containers) {
    if (container.dataset.releaseComments === tag) return container;
  }
  return null;
}

/**
 * Injects giscus's loader into one release's container.
 *
 * The script is created on the press rather than rendered with the page, which
 * is the whole economy of this feature: four embeds mounted on every visit
 * would be four iframes, four sets of requests and four thread renders, paid
 * for by every reader including the ones who never open a conversation.
 */
function mountThread(container: HTMLElement, tag: string, onError: () => void): void {
  const script = document.createElement('script');
  script.src = GISCUS_SCRIPT_URL;
  script.async = true;

  const attributes = giscusScriptAttributes(discussionTerm(tag), isDark());
  for (const [name, value] of Object.entries(attributes)) {
    script.setAttribute(name, value);
  }

  // The script failing to load is the one failure that reports itself. Every
  // other way this can go wrong is silent from out here, which is what the
  // timeout is for.
  script.addEventListener('error', onError);
  container.append(script);
}

/**
 * Which release the reader is currently looking at.
 *
 * The first entry in document order that is on screen wins, rather than the one
 * showing the most of itself: a reader scrolling down passes through moments
 * where the next release is briefly the larger of the two, and picking by area
 * makes the control's target flicker between versions mid-scroll.
 *
 * Never empty after the first observation. When nothing is on screen — a reader
 * parked on the footer — the last answer stands, because the control has to be
 * about SOME release and the last one they looked at is the only defensible
 * guess.
 */
function useActiveRelease(tags: string[]): string {
  const [active, setActive] = useState(tags[0] ?? '');
  // Joined rather than passed as the array: the caller rebuilds it every
  // render, so depending on its identity would tear the observer down and
  // rebuild it on every state change this component makes.
  const key = tags.join(' ');

  useEffect(() => {
    const order = key.split(' ');
    const onScreen = new Set<string>();

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target.id);
        else onScreen.delete(entry.target.id);
      }

      const first = order.find((tag) => onScreen.has(tag));
      if (first) setActive(first);
    });

    for (const tag of order) {
      const article = document.getElementById(tag);
      if (article) observer.observe(article);
    }

    return () => observer.disconnect();
  }, [key]);

  return active;
}

/**
 * The comment control: the icon, what a press means, and the threads it opens.
 *
 * The button is the control — not the canvas. A canvas with a hit area in it
 * takes no keyboard focus and has no accessible name, so an icon wired that way
 * is a thing that visibly responds to a mouse and does not exist to anything
 * else. Every state machine input is fired from this button's own handlers,
 * which is also why the keyboard gets the same affordance as the pointer rather
 * than a second implementation of it.
 */
export function ChangelogSyncButton({ releases }: ChangelogSyncButtonProps) {
  const tags = releases.map((release) => release.tag);
  const activeTag = useActiveRelease(tags);

  const [statuses, setStatuses] = useState<Record<string, ThreadStatus>>({});
  const lottie = useRef<DotLottie | null>(null);

  /** In-flight mounts, by tag. A reader can start one, scroll on, and start another. */
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Read inside handlers and observers that must not be rebuilt when these
  // change: the current statuses and the active release are answered at the
  // moment a message or a timer arrives, not when the listener was installed.
  //
  // Written in an effect rather than during render — writing a ref while
  // rendering is a side effect in a function React is allowed to call twice and
  // throw one result away, and the lint rule that says so is right. Nothing
  // reads these during a render either: every reader is a message handler, a
  // timer or the player's own callback, all of which run after the commit that
  // updated them. Declared FIRST so it runs before the effects below, which do
  // read them.
  const statusesRef = useRef(statuses);
  const activeRef = useRef(activeTag);

  useEffect(() => {
    statusesRef.current = statuses;
    activeRef.current = activeTag;
  });

  const status = statuses[activeTag] ?? 'idle';

  const fire = useCallback((event: string) => {
    lottie.current?.stateMachineFireEvent(event);
  }, []);

  /**
   * Ends one mount, once.
   *
   * Guarded on the tag still being pending, which is what makes the two racing
   * answers — the metadata message and the timer — settle to whichever arrived
   * first, instead of the timer overwriting a thread that landed at 14.9
   * seconds with a failure.
   *
   * The machine is told only when the settled release is the one on screen. If
   * the reader has scrolled to another version the icon is about that version
   * now, and playing this one's check over it would be a green tick attached to
   * a conversation they are not looking at.
   */
  const settle = useCallback(
    (tag: string, outcome: 'ready' | 'failed') => {
      const timer = pending.current.get(tag);
      if (timer === undefined) return;

      clearTimeout(timer);
      pending.current.delete(tag);
      setStatuses((previous) => ({ ...previous, [tag]: outcome }));

      if (tag === activeRef.current) fire(outcome === 'ready' ? 'syncOk' : 'syncFailed');
    },
    [fire],
  );

  /**
   * The metadata message, filtered three ways.
   *
   * Origin, then shape, then — the one that is not obvious — that it came from
   * THIS container's own frame. Every embed already open keeps posting on this
   * channel for as long as it is on the page, so origin and shape alone would
   * let an older thread's traffic answer for a mount still in flight: a check
   * mark over a conversation that never rendered, which is the failure this
   * control exists not to have.
   */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== GISCUS_ORIGIN) return;
      if (!isGiscusMetadataMessage(event.data)) return;

      for (const tag of pending.current.keys()) {
        const frame = threadContainer(tag)?.querySelector('iframe');
        if (frame && event.source === frame.contentWindow) {
          settle(tag, 'ready');
          return;
        }
      }
    };

    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, [settle]);

  /** Nothing left running when the page goes away. */
  useEffect(() => {
    const timers = pending.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /**
   * The theme, on the icon and on every thread already open.
   *
   * `[data-theme]` on the root element is what decides — never
   * `prefers-color-scheme` — and light is the attribute's ABSENCE, so the
   * observer watches the attribute itself and add, change and remove all reach
   * here. The embeds are re-themed in the same callback because there is no
   * "the giscus on the page": there is one per release that has been opened,
   * and a flip has to reach all of them or the ones already open keep the old
   * palette.
   */
  useEffect(() => {
    const apply = () => {
      const dark = isDark();
      lottie.current?.setTheme(dark ? 'gate-dark' : 'gate-light');

      const frames = document.querySelectorAll<HTMLIFrameElement>(
        '[data-release-comments] iframe',
      );
      for (const frame of frames) postGiscusTheme(frame, dark);
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  /**
   * The icon follows the release, not the reader's last press.
   *
   * Scrolling from a version whose conversation is open to one whose is not has
   * to take the check mark away, or the icon claims a thread is loaded for a
   * release nobody has asked about. An override rather than an event because
   * this is a jump, not a transition: there is no press, and nothing for the
   * machine to play through.
   */
  useEffect(() => {
    const current = statusesRef.current[activeTag] ?? 'idle';
    lottie.current?.stateMachineOverrideState(STATE_FOR_STATUS[current], true);
  }, [activeTag]);

  const onLottieReady = useCallback((instance: DotLottie) => {
    lottie.current = instance;
    instance.setTheme(isDark() ? 'gate-dark' : 'gate-light');

    // The reader may have opened this release's thread before the player
    // finished loading — a fresh machine starts at `s-idle`, which would be the
    // icon contradicting what the page already shows.
    const current = statusesRef.current[activeRef.current] ?? 'idle';
    if (current !== 'idle') {
      instance.stateMachineOverrideState(STATE_FOR_STATUS[current], true);
    }
  }, []);

  const onLottieTeardown = useCallback(() => {
    lottie.current = null;
  }, []);

  const startMount = (tag: string) => {
    const container = threadContainer(tag);
    if (!container) return;

    setStatuses((previous) => ({ ...previous, [tag]: 'loading' }));
    fire('click');

    pending.current.set(
      tag,
      setTimeout(() => settle(tag, 'failed'), MOUNT_TIMEOUT_MS),
    );

    mountThread(container, tag, () => settle(tag, 'failed'));
  };

  /**
   * What a press means, which is not one thing.
   *
   * With the thread already mounted it MOVES the reader to it and touches
   * neither the machine nor the network — a control that replayed its loading
   * sequence over a conversation sitting further down the same page would be
   * animating work it is not doing. From a failure it retries, and the retry is
   * the reader's to ask for: an automatic one would sit there re-requesting a
   * blocked frame while telling them nothing.
   */
  const handlePress = () => {
    if (status === 'loading') return;

    if (status === 'ready') {
      threadContainer(activeTag)?.scrollIntoView({ block: 'start' });
      return;
    }

    startMount(activeTag);
  };

  return (
    <div
      className="changelog-sync"
      // Published to CSS so the note wraps to exactly the icon's width. The box
      // itself is sized inline by `LottieBlock` — a second literal in the
      // stylesheet is a second thing to forget when this number moves.
      style={{ '--changelog-sync-size': `${ICON_SIZE}px` } as CSSProperties}
    >
      <button
        type="button"
        className="changelog-sync__button"
        onClick={handlePress}
        // Hover and focus drive the same two inputs, so the machine cannot tell
        // a pointer from a tab key — which is the point. The file's own pointer
        // interactions never run: the canvas takes no pointer events.
        onPointerEnter={() => fire('pointerEnter')}
        onPointerLeave={() => fire('pointerExit')}
        onFocus={() => fire('pointerEnter')}
        onBlur={() => fire('pointerExit')}
        aria-label={LABEL_FOR_STATUS[status](activeTag)}
        aria-busy={status === 'loading'}
        data-status={status}
      >
        <LottieBlock
          src={LOTTIE_SRC}
          size={ICON_SIZE}
          stateMachineId={STATE_MACHINE}
          still={<ChangelogSyncStill />}
          onReady={onLottieReady}
          onTeardown={onLottieTeardown}
          className="changelog-sync__icon"
        />
      </button>

      {/* Always in the tree, empty until there is something to say: a live
          region added to the page at the moment its text appears is a region
          assistive tech was not watching when the text appeared. */}
      <p className="changelog-sync__note" role="status">
        {status === 'failed' ? COMMENTS_FAILED_NOTE : ''}
      </p>
    </div>
  );
}

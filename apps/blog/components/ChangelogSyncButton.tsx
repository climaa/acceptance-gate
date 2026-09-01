'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';
import { threadContainer, useGiscusThreads } from '@/hooks/useGiscusThreads';
import { useSyncedTheme } from '@/hooks/useSyncedTheme';
import {
  EVENTS,
  LOTTIE_SRC,
  STATE_FOR_STATUS,
  STATE_MACHINE,
  THEMES,
  type ThreadStatus,
} from '@/lib/changelog-sync-asset';
import { postGiscusTheme } from '@/lib/giscus';
import {
  commentsGoToLabel,
  commentsLoadingLabel,
  commentsLoadLabel,
  commentsRetryLabel,
  COMMENTS_FAILED_NOTE,
} from '@/lib/site';
import { ChangelogSyncStill } from './ChangelogSyncStill';
import { LottieBlock } from './LottieBlock';

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
 *
 * The giscus mechanics — the script, the cross-origin channel and the races
 * between a message and a timer — live in `useGiscusThreads`. What is left here
 * is the part that is genuinely about an icon: which release it is aimed at,
 * what it is called, and which state it should be showing.
 */
export function ChangelogSyncButton({ releases }: ChangelogSyncButtonProps) {
  const tags = releases.map((release) => release.tag);
  const activeTag = useActiveRelease(tags);
  const lottie = useRef<DotLottie | null>(null);

  const fire = useCallback((event: string) => {
    lottie.current?.stateMachineFireEvent(event);
  }, []);

  /**
   * The release on screen, for the two callbacks below.
   *
   * A ref because both fire from outside a render — a timer, or a cross-origin
   * message — long after the commit that installed them. Written in an effect,
   * never during render: a ref write is a side effect, and React may call a
   * render twice and discard one result.
   */
  const activeRef = useRef(activeTag);
  useEffect(() => {
    activeRef.current = activeTag;
  });

  /**
   * The machine hears about a mount only when the settled release is the one on
   * screen. If the reader has scrolled to another version the icon is about
   * that version now, and playing this one's check over it would be a green
   * tick attached to a conversation they are not looking at.
   */
  const { statuses, open } = useGiscusThreads({
    onStarted: (tag) => {
      if (tag === activeRef.current) fire(EVENTS.click);
    },
    onSettled: (tag, outcome) => {
      if (tag === activeRef.current) {
        fire(outcome === 'ready' ? EVENTS.syncOk : EVENTS.syncFailed);
      }
    },
  });

  const status = statuses[activeTag] ?? 'idle';

  /**
   * The theme, on the icon and on every thread already open.
   *
   * The embeds are re-themed in the same callback because there is no "the
   * giscus on the page": there is one per release that has been opened, and a
   * flip has to reach all of them or the ones already open keep the old
   * palette.
   */
  const applyTheme = useCallback(() => {
    const dark = isDark();
    lottie.current?.setTheme(dark ? THEMES.dark : THEMES.light);

    const frames = document.querySelectorAll<HTMLIFrameElement>(
      '[data-release-comments] iframe',
    );
    for (const frame of frames) postGiscusTheme(frame, dark);
  }, []);

  useSyncedTheme(applyTheme);

  /**
   * The icon follows the release, not the reader's last press.
   *
   * Scrolling from a version whose conversation is open to one whose is not has
   * to take the check mark away, or the icon claims a thread is loaded for a
   * release nobody has asked about. An override rather than an event because
   * this is a jump, not a transition: there is no press, and nothing for the
   * machine to play through.
   *
   * The guard on `shownFor` is what makes this independent of effect ordering.
   * `status` is read from render scope, so it is always this render's answer for
   * this render's `activeTag`. Reading it from a ref instead would have made
   * correctness depend on this effect being declared after the one that writes
   * that ref — an invariant nothing but a comment could enforce, whose failure
   * mode is the icon showing the previous release's state and no check noticing.
   */
  const shownFor = useRef(activeTag);
  useEffect(() => {
    if (shownFor.current === activeTag) return;

    shownFor.current = activeTag;
    lottie.current?.stateMachineOverrideState(STATE_FOR_STATUS[status], true);
  }, [activeTag, status]);

  const onLottieReady = useCallback(
    (instance: DotLottie) => {
      lottie.current = instance;
      instance.setTheme(isDark() ? THEMES.dark : THEMES.light);

      // The reader may have opened this release's thread before the player
      // finished loading — a fresh machine starts at `s-idle`, which would be
      // the icon contradicting what the page already shows.
      if (status !== 'idle') {
        instance.stateMachineOverrideState(STATE_FOR_STATUS[status], true);
      }
    },
    [status],
  );

  const onLottieTeardown = useCallback(() => {
    lottie.current = null;
  }, []);

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

    open(activeTag);
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
        onPointerEnter={() => fire(EVENTS.pointerEnter)}
        onPointerLeave={() => fire(EVENTS.pointerExit)}
        onFocus={() => fire(EVENTS.pointerEnter)}
        onBlur={() => fire(EVENTS.pointerExit)}
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
